import { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../config/env';
import { IUser, User } from '../models/User';
import * as authService from '../services/auth.service';
import { signAccessToken, verifyRefreshToken } from '../services/token.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { parseDurationToMs } from '../utils/parseDuration';
import { sendResponse } from '../utils/sendResponse';
import {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '../validators/auth.validator';

const REFRESH_COOKIE_NAME = 'refreshToken';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN),
    path: '/api/v1/auth',
  };
}

function serializeUser(user: IUser) {
  return {
    id: user.id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatar: user.avatar,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
  };
}

export const register = asyncHandler(async (req: Request<unknown, unknown, RegisterInput>, res: Response) => {
  const { user, tokens } = await authService.register(req.body);

  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions());
  sendResponse(res, 201, {
    data: { user: serializeUser(user), accessToken: tokens.accessToken },
    message: 'Registration successful',
  });
});

export const login = asyncHandler(async (req: Request<unknown, unknown, LoginInput>, res: Response) => {
  const { user, tokens } = await authService.login(req.body);

  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions());
  sendResponse(res, 200, {
    data: { user: serializeUser(user), accessToken: tokens.accessToken },
    message: 'Login successful',
  });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
  sendResponse(res, 200, { message: 'Logged out successfully' });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

  if (!token) {
    throw new AppError('Refresh token missing. Please log in again.', 401);
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new AppError('The user belonging to this token no longer exists', 401);
  }

  const accessToken = signAccessToken(user.id as string, user.role);
  // Return the user too so the client can resync its persisted user with the
  // identity the refresh cookie actually belongs to (prevents a stale
  // admin/customer mismatch between the displayed user and the token).
  sendResponse(res, 200, { data: { accessToken, user: serializeUser(user) } });
});

export const forgotPassword = asyncHandler(
  async (req: Request<unknown, unknown, ForgotPasswordInput>, res: Response) => {
    await authService.forgotPassword(req.body);
    sendResponse(res, 200, {
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  },
);

export const resetPassword = asyncHandler(
  async (req: Request<{ token: string }, unknown, ResetPasswordInput>, res: Response) => {
    await authService.resetPassword(req.params.token, req.body);
    sendResponse(res, 200, { message: 'Password has been reset successfully. Please log in.' });
  },
);

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }
  sendResponse(res, 200, { data: { user: serializeUser(req.user) } });
});
