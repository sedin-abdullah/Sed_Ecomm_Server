import { Types } from 'mongoose';
import { Product } from '../models/Product';
import { IReview, Review } from '../models/Review';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { saveUploadedFile } from '../utils/saveUpload';
import { CreateReviewInput } from '../validators/review.validator';

export async function recomputeProductRating(productId: Types.ObjectId | string): Promise<void> {
  const stats = await Review.aggregate([
    { $match: { product: new Types.ObjectId(String(productId)) } },
    { $group: { _id: '$product', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const { avgRating = 0, count = 0 } = stats[0] ?? {};

  await Product.findByIdAndUpdate(productId, {
    rating: Math.round(avgRating * 10) / 10,
    numReviews: count,
  });
}

export async function listReviewsForProduct(productId: string, query: { page?: string; limit?: string }) {
  const productExists = await Product.exists({ _id: productId });
  if (!productExists) {
    throw new AppError('Product not found', 404);
  }

  const { page, limit, skip } = parsePagination(query);

  const [reviews, total] = await Promise.all([
    Review.find({ product: productId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name avatar')
      .lean(),
    Review.countDocuments({ product: productId }),
  ]);

  return {
    reviews: reviews.map((r) => ({ ...r, id: String(r._id) })),
    pagination: buildPaginationMeta(page, limit, total),
  };
}

export async function createReview(
  productId: string,
  userId: string,
  input: CreateReviewInput,
  files?: Express.Multer.File[],
): Promise<IReview> {
  const product = await Product.exists({ _id: productId });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const existing = await Review.findOne({ product: productId, user: userId });
  if (existing) {
    throw new AppError('You have already reviewed this product', 409);
  }

  const images = (files ?? []).map((f) => saveUploadedFile(f, 'reviews'));

  const review = await Review.create({
    product: productId,
    user: userId,
    rating: input.rating,
    comment: input.comment,
    images,
  });

  await recomputeProductRating(productId);
  return review;
}

export async function deleteReview(reviewId: string, userId: string, isAdmin: boolean): Promise<void> {
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new AppError('Review not found', 404);
  }
  if (!isAdmin && String(review.user) !== userId) {
    throw new AppError('You do not have permission to delete this review', 403);
  }

  const productId = review.product;
  await review.deleteOne();
  await recomputeProductRating(productId);
}

export async function toggleLikeReview(reviewId: string, userId: string): Promise<IReview> {
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  const alreadyLiked = review.likes.some((id) => String(id) === userId);
  if (alreadyLiked) {
    review.likes = review.likes.filter((id) => String(id) !== userId) as typeof review.likes;
  } else {
    review.likes.push(new Types.ObjectId(userId));
  }

  await review.save();
  return review;
}
