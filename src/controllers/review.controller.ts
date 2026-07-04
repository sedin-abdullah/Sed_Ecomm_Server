import { Request, Response } from 'express';
import * as reviewService from '../services/review.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { CreateReviewInput } from '../validators/review.validator';

export const listByProduct = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const { reviews, pagination } = await reviewService.listReviewsForProduct(req.params.id, req.query);
  sendResponse(res, 200, { data: reviews, pagination });
});

export const create = asyncHandler(
  async (req: Request<{ id: string }, unknown, CreateReviewInput>, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const review = await reviewService.createReview(req.params.id, req.user.id as string, req.body, files);
    sendResponse(res, 201, { data: review, message: 'Review submitted successfully' });
  },
);

export const remove = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);
  await reviewService.deleteReview(req.params.id, req.user.id as string, req.user.role === 'admin');
  sendResponse(res, 200, { message: 'Review deleted successfully' });
});

export const like = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);
  const review = await reviewService.toggleLikeReview(req.params.id, req.user.id as string);
  sendResponse(res, 200, { data: review });
});
