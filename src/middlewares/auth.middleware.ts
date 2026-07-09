import { NextFunction, Request, Response } from 'express';
import { User, UserRole } from '../models/User';
import { verifyAccessToken } from '../services/token.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Verifies the `Authorization: Bearer <accessToken>` header, loads the
 * corresponding user onto `req.user`, and rejects the request with 401 if
 * the token is missing, malformed, expired, or references a deleted user.
 */
export const protect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required. Please log in.', 401);
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new AppError('The user belonging to this token no longer exists', 401);
  }
  if (!user.isActive) {
    throw new AppError('Your account has been disabled. Please contact support.', 403);
  }

  req.user = user;
  next();
});

/**
 * Role hierarchy: customer < admin (Store Owner) < manager < superadmin.
 * `restrictTo(role)` allows that role AND anyone above it, so a manager passes
 * an `admin`-gated route and a superadmin passes everything. Chaining a second
 * `restrictTo('superadmin')` on a specific route narrows it to superadmin only.
 */
const ROLE_RANK: Record<UserRole, number> = {
  customer: 0,
  admin: 1,
  manager: 2,
  superadmin: 3,
};

export function restrictTo(...roles: UserRole[]) {
  const minRank = Math.min(...roles.map((r) => ROLE_RANK[r]));
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || ROLE_RANK[req.user.role] < minRank) {
      next(new AppError('You do not have permission to perform this action', 403));
      return;
    }
    next();
  };
}
