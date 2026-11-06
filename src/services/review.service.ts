import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { saveUploadedFile } from '../utils/saveUpload';
import { toApi } from '../utils/serialize';
import { assertUuid } from '../utils/uuid';
import { CreateReviewInput } from '../validators/review.validator';

/**
 * Shapes a review for the API. `user` is the populated summary when included
 * (review list) or the bare user id otherwise (create/like). `likes` is the
 * array of user ids who liked it, reconstructed from the ReviewLike join table.
 */
function serializeReview(review: Record<string, unknown>) {
  const api = toApi(review) as Record<string, unknown>;
  const { productId, userId, user, likes, ...rest } = api;
  const likeIds = Array.isArray(likes)
    ? (likes as { userId: string }[]).map((l) => l.userId)
    : [];

  return {
    ...rest,
    product: productId,
    user: user !== undefined ? user : userId,
    likes: likeIds,
  };
}

export async function recomputeProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const avgRating = agg._avg.rating ?? 0;
  const count = agg._count._all;

  await prisma.product.update({
    where: { id: productId },
    data: { rating: Math.round(avgRating * 10) / 10, numReviews: count },
  });
}

export async function listReviewsForProduct(productId: string, query: { page?: string; limit?: string }) {
  assertUuid(productId);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const { page, limit, skip } = parsePagination(query);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        likes: { select: { userId: true } },
      },
    }),
    prisma.review.count({ where: { productId } }),
  ]);

  return {
    reviews: reviews.map(serializeReview),
    pagination: buildPaginationMeta(page, limit, total),
  };
}

export async function createReview(
  productId: string,
  userId: string,
  input: CreateReviewInput,
  files?: Express.Multer.File[],
) {
  assertUuid(productId);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('You have already reviewed this product', 409);
  }

  const images = (files ?? []).map((f) => saveUploadedFile(f, 'reviews'));

  const review = await prisma.review.create({
    data: { productId, userId, rating: input.rating, comment: input.comment, images },
  });

  await recomputeProductRating(productId);
  return serializeReview(review);
}

export async function deleteReview(reviewId: string, userId: string, isAdmin: boolean): Promise<void> {
  assertUuid(reviewId);
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true, productId: true },
  });
  if (!review) {
    throw new AppError('Review not found', 404);
  }
  if (!isAdmin && review.userId !== userId) {
    throw new AppError('You do not have permission to delete this review', 403);
  }

  await prisma.review.delete({ where: { id: reviewId } });
  await recomputeProductRating(review.productId);
}

export async function toggleLikeReview(reviewId: string, userId: string) {
  assertUuid(reviewId);
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  const key = { reviewId_userId: { reviewId, userId } };
  const existing = await prisma.reviewLike.findUnique({ where: key, select: { userId: true } });
  if (existing) {
    await prisma.reviewLike.delete({ where: key });
  } else {
    await prisma.reviewLike.create({ data: { reviewId, userId } });
  }

  const updated = await prisma.review.findUniqueOrThrow({
    where: { id: reviewId },
    include: { likes: { select: { userId: true } } },
  });
  return serializeReview(updated);
}
