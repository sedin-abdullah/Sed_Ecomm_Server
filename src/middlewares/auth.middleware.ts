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
 * Restricts access to users whose role is included in `roles`. Must be
 * used after `protect` so that `req.user` is populated.
 *
 * Role hierarchy: `manager` is a superset of `admin`, so a manager passes any
 * route that allows `admin` (no need to list 'manager' on every admin route).
 */
export function restrictTo(...roles: UserRole[]) {
  const allowed = new Set(roles);
  if (allowed.has('admin')) allowed.add('manager');
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !allowed.has(req.user.role)) {
      next(new AppError('You do not have permission to perform this action', 403));
      return;
    }
    next();
  };
}
