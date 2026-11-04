import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { serializeProductSummary } from '../utils/serializeProduct';
import { assertUuid, isUuid } from '../utils/uuid';

// The product fields the client needs for each wishlist entry (was PRODUCT_POPULATE).
const PRODUCT_SELECT = {
  select: { id: true, name: true, slug: true, images: true, price: true, discountPrice: true, stock: true, rating: true, numReviews: true },
} as const;

const WISHLIST_INCLUDE = {
  items: { include: { product: PRODUCT_SELECT }, orderBy: { addedAt: 'asc' as const } },
};

type WishlistRow = {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: { product: Record<string, unknown> | null }[];
};

function serializeWishlist(row: WishlistRow) {
  return {
    _id: row.id,
    id: row.id,
    user: row.userId,
    products: row.items.map((it) => serializeProductSummary(it.product)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getWishlistRow(userId: string): Promise<WishlistRow> {
  const existing = await prisma.wishlist.findUnique({ where: { userId }, include: WISHLIST_INCLUDE });
  if (existing) return existing as unknown as WishlistRow;
  return (await prisma.wishlist.create({ data: { userId }, include: WISHLIST_INCLUDE })) as unknown as WishlistRow;
}

export async function getWishlist(userId: string) {
  return serializeWishlist(await getWishlistRow(userId));
}

export async function addProduct(userId: string, productId: string) {
  assertUuid(productId);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const wishlist = await prisma.wishlist.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });

  // Idempotent add (was a "not already in" guard on the products array).
  await prisma.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    create: { wishlistId: wishlist.id, productId },
    update: {},
  });

  return getWishlist(userId);
}

export async function removeProduct(userId: string, productId: string) {
  const wishlist = await getWishlistRow(userId);
  // Malformed ids simply match nothing (the old array filter was a no-op too).
  if (isUuid(productId)) {
    await prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productId } });
  }
  return getWishlist(userId);
}
