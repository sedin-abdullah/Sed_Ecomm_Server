import crypto from 'crypto';
import { env } from '../config/env';
import { IUser, User } from '../models/User';
import { AppError } from '../utils/AppError';
import { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from '../validators/auth.validator';
import { signAccessToken, signRefreshToken } from './token.service';

const RESET_TOKEN_EXPIRES_MS = 10 * 60 * 1000; // 10 minutes

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: IUser;
  tokens: AuthTokens;
}

function issueTokens(user: IUser): AuthTokens {
  return {
    accessToken: signAccessToken(user.id as string, user.role),
    refreshToken: signRefreshToken(user.id as string),
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
  });

  return { user, tokens: issueTokens(user) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+password');
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.isActive) {
    throw new AppError('Your account has been disabled. Please contact support.', 403);
  }

  return { user, tokens: issueTokens(user) };
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const user = await User.findOne({ email: input.email });

  // Do not reveal whether the email exists — always behave the same way.
  if (!user) {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_EXPIRES_MS);
  await user.save({ validateBeforeSave: false });

  const resetLink = `${env.CLIENT_URL}/reset-password/${rawToken}`;
  // eslint-disable-next-line no-console
  console.log(
    `[EMAIL SIMULATION] To: ${user.email} | Subject: Reset your password | Link: ${resetLink}`,
  );
}

export async function resetPassword(rawToken: string, input: ResetPasswordInput): Promise<void> {
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+password +passwordResetToken +passwordResetExpires');

  if (!user) {
    throw new AppError('Password reset token is invalid or has expired', 400);
  }

  user.password = input.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
}
