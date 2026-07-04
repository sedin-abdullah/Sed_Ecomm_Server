import { Request, Response } from 'express';
import * as wishlistService from '../services/wishlist.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';

function requireUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) throw new AppError('Authentication required', 401);
  return req.user.id as string;
}

export const getWishlist = asyncHandler(async (req: Request, res: Response) => {
  const wishlist = await wishlistService.getWishlist(requireUserId(req));
  sendResponse(res, 200, { data: wishlist });
});

export const addProduct = asyncHandler(async (req: Request<{ productId: string }>, res: Response) => {
  const wishlist = await wishlistService.addProduct(requireUserId(req), req.params.productId);
  sendResponse(res, 200, { data: wishlist, message: 'Product added to wishlist' });
});

export const removeProduct = asyncHandler(async (req: Request<{ productId: string }>, res: Response) => {
  const wishlist = await wishlistService.removeProduct(requireUserId(req), req.params.productId);
  sendResponse(res, 200, { data: wishlist, message: 'Product removed from wishlist' });
});
