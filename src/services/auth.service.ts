import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import type { PublicUser } from '../types/user';
import { AppError } from '../utils/AppError';
import { toApi } from '../utils/serialize';
import { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from '../validators/auth.validator';
import { signAccessToken, signRefreshToken } from './token.service';
import { comparePassword, hashPassword } from './user.service';

const RESET_TOKEN_EXPIRES_MS = 10 * 60 * 1000; // 10 minutes

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

function issueTokens(user: { id: string; role: PublicUser['role'] }): AuthTokens {
  return {
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: signRefreshToken(user.id),
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: await hashPassword(input.password),
    },
  });

  return { user: toApi(user) as PublicUser, tokens: issueTokens(user) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  // `omit: { password: false }` opts the hashed password back in (it is globally
  // omitted), mirroring the old `.select('+password')`.
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    omit: { password: false },
  });
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const { password, ...rest } = user;
  const isMatch = await comparePassword(input.password, password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!rest.isActive) {
    throw new AppError('Your account has been disabled. Please contact support.', 403);
  }

  return { user: toApi(rest) as PublicUser, tokens: issueTokens(user) };
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Do not reveal whether the email exists — always behave the same way.
  if (!user) {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + RESET_TOKEN_EXPIRES_MS),
    },
  });

  const resetLink = `${env.CLIENT_URL}/reset-password/${rawToken}`;
  // eslint-disable-next-line no-console
  console.log(
    `[EMAIL SIMULATION] To: ${user.email} | Subject: Reset your password | Link: ${resetLink}`,
  );
}

export async function resetPassword(rawToken: string, input: ResetPasswordInput): Promise<void> {
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) {
    throw new AppError('Password reset token is invalid or has expired', 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await hashPassword(input.password),
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });
}
