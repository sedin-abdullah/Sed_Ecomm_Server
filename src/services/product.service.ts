import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { toClientImages } from '../utils/productImage';
import { saveUploadedFile } from '../utils/saveUpload';
import { toApi } from '../utils/serialize';
import { uniqueSlug } from '../utils/slug';
import { assertUuid, isUuid } from '../utils/uuid';
import { CreateProductInput, ListProductsQuery, UpdateProductInput } from '../validators/product.validator';

const SORT_MAP: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  price_asc: { price: 'asc' },
  price_desc: { price: 'desc' },
  newest: { createdAt: 'desc' },
  popular: { numReviews: 'desc' },
  rating: { rating: 'desc' },
};

// Summary of the related category as the client expects it on a product.
const CATEGORY_SELECT = { select: { id: true, name: true, slug: true } } as const;

/**
 * Shapes a Prisma product for the API, preserving the old Mongoose/Mongo
 * contract: `_id` mirrors `id` (added by toApi, including on the nested
 * category), Decimal prices/rating become plain numbers, the flat `sizes`/
 * `colors` columns are re-nested under `variants`, images become `{id, url}`
 * objects, and `category` is the populated object when included, otherwise the
 * bare id string (matching how create/update used to return an unpopulated id).
 */
function serializeProduct(product: Record<string, unknown>): Record<string, unknown> {
  const api = toApi(product) as Record<string, unknown>;
  const { sizes, colors, categoryId, category, images, ...rest } = api;

  return {
    ...rest,
    category: category !== undefined ? category : categoryId,
    images: toClientImages((product.images as string[] | undefined) ?? []),
    variants: {
      sizes: (sizes as string[] | undefined) ?? [],
      colors: (colors as string[] | undefined) ?? [],
    },
  };
}

async function productSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const found = await prisma.product.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return found !== null;
}

/** Resolves a category slug or id to itself plus its direct children ids. */
async function resolveCategoryIds(categoryParam: string): Promise<string[]> {
  const category = isUuid(categoryParam)
    ? await prisma.category.findUnique({ where: { id: categoryParam }, select: { id: true } })
    : await prisma.category.findFirst({ where: { slug: categoryParam }, select: { id: true } });

  if (!category) return [];

  const children = await prisma.category.findMany({
    where: { parentId: category.id },
    select: { id: true },
  });
  return [category.id, ...children.map((c) => c.id)];
}

export async function listProducts(query: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = {};

  if (query.category) {
    const ids = await resolveCategoryIds(query.category);
    // No matching category → force an empty result set rather than ignoring the filter.
    where.categoryId = { in: ids.length ? ids : ['00000000-0000-0000-0000-000000000000'] };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }

  if (query.rating !== undefined) where.rating = { gte: query.rating };
  if (query.brand) where.brand = { equals: query.brand, mode: 'insensitive' };
  if (query.size) where.sizes = { has: query.size };
  // NOTE: Postgres array membership is case-sensitive (no `mode` for list
  // fields), unlike the old case-insensitive regex. The client sends exact
  // facet values from getProductFilterFacets, so this matches in practice.
  if (query.color) where.colors = { has: query.color };
  if (query.featured) where.isFeatured = true;
  if (query.flashSale) where.isFlashSale = true;
  if (query.newArrival) where.isNewArrival = true;
  if (query.bestSeller) where.isBestSeller = true;
  if (query.inStock) where.stock = { gt: 0 };
  // A product is "on sale" when it has a positive discountPrice; `gt: 0` also
  // excludes rows where the field is null (no discount).
  if (query.onSale) where.discountPrice = { gt: 0 };
  // Hide disabled products from customers; admin listing passes includeInactive.
  if (!query.includeInactive) where.isActive = true;
  // Mongo text search is replaced with a case-insensitive contains across the
  // same fields (no relevance ranking in Postgres without extra setup).
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
      { brand: { contains: query.search, mode: 'insensitive' } },
      { tags: { has: query.search } },
    ];
  }

  const { page, limit, skip } = parsePagination(query);
  const orderBy = SORT_MAP[query.sort ?? 'newest'];

  const [products, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy, skip, take: limit, include: { category: CATEGORY_SELECT } }),
    prisma.product.count({ where }),
  ]);

  return {
    products: products.map(serializeProduct),
    pagination: buildPaginationMeta(page, limit, total),
  };
}

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findUnique({ where: { slug }, include: { category: CATEGORY_SELECT } });
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  return serializeProduct(product);
}

export async function getRelatedProducts(id: string, limit = 8) {
  assertUuid(id);
  const product = await prisma.product.findUnique({ where: { id }, select: { id: true, categoryId: true } });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const related = await prisma.product.findMany({
    where: { categoryId: product.categoryId, id: { not: product.id } },
    orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: { category: CATEGORY_SELECT },
  });

  return related.map(serializeProduct);
}

export async function suggestProducts(q: string) {
  if (!q || !q.trim()) return [];

  const suggestions = await prisma.product.findMany({
    where: { name: { contains: q.trim(), mode: 'insensitive' } },
    select: { id: true, name: true, slug: true, images: true },
    take: 8,
  });

  return suggestions.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    image: p.images[0],
  }));
}

/** Distinct filter facets present in the catalog, for building the shop filter UI. */
export async function getProductFilterFacets() {
  const rows = await prisma.product.findMany({ select: { brand: true, sizes: true, colors: true } });

  const brands = new Set<string>();
  const sizes = new Set<string>();
  const colors = new Set<string>();

  for (const row of rows) {
    if (row.brand && row.brand.trim() !== '') brands.add(row.brand);
    row.sizes.forEach((s) => { if (s && s.trim() !== '') sizes.add(s); });
    row.colors.forEach((c) => { if (c && c.trim() !== '') colors.add(c); });
  }

  const sortValues = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b));
  return { brands: sortValues(brands), sizes: sortValues(sizes), colors: sortValues(colors) };
}

export async function createProduct(input: CreateProductInput, files?: Express.Multer.File[]) {
  const category = await prisma.category.findUnique({ where: { id: input.category }, select: { id: true } });
  if (!category) {
    throw new AppError('Category not found', 400);
  }

  const uploadedImages = (files ?? []).map((f) => saveUploadedFile(f, 'products'));
  const images = [...(input.images ?? []), ...uploadedImages];
  const slug = await uniqueSlug(input.name, (s) => productSlugTaken(s));

  const product = await prisma.product.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      categoryId: input.category,
      brand: input.brand,
      price: input.price,
      discountPrice: input.discountPrice,
      stock: input.stock,
      images,
      sizes: input.sizes ?? [],
      colors: input.colors ?? [],
      tags: input.tags ?? [],
      isFeatured: input.isFeatured ?? false,
      isFlashSale: input.isFlashSale ?? false,
      flashSaleEndsAt: input.flashSaleEndsAt,
      isNewArrival: input.isNewArrival ?? false,
      isBestSeller: input.isBestSeller ?? false,
      blockAddToCart: input.blockAddToCart ?? false,
      blockCheckout: input.blockCheckout ?? false,
      isActive: input.isActive ?? true,
    },
  });

  return serializeProduct(product);
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  files?: Express.Multer.File[],
) {
  assertUuid(id);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Product not found', 404);
  }

  const data: Prisma.ProductUpdateInput = {};

  if (input.category !== undefined) {
    const categoryExists = await prisma.category.findUnique({ where: { id: input.category }, select: { id: true } });
    if (!categoryExists) {
      throw new AppError('Category not found', 400);
    }
    data.category = { connect: { id: input.category } };
  }

  if (input.name !== undefined) {
    data.name = input.name;
    // Regenerate the slug only when the name actually changes (old pre-validate hook).
    if (input.name !== existing.name) {
      data.slug = await uniqueSlug(input.name, (s) => productSlugTaken(s, id));
    }
  }

  if (input.description !== undefined) data.description = input.description;
  if (input.brand !== undefined) data.brand = input.brand;
  if (input.price !== undefined) data.price = input.price;
  if (input.discountPrice !== undefined) data.discountPrice = input.discountPrice;
  if (input.stock !== undefined) data.stock = input.stock;
  if (input.sizes !== undefined) data.sizes = { set: input.sizes };
  if (input.colors !== undefined) data.colors = { set: input.colors };
  if (input.tags !== undefined) data.tags = { set: input.tags };
  if (input.isFeatured !== undefined) data.isFeatured = input.isFeatured;
  if (input.isFlashSale !== undefined) data.isFlashSale = input.isFlashSale;
  if (input.flashSaleEndsAt !== undefined) data.flashSaleEndsAt = input.flashSaleEndsAt;
  if (input.isNewArrival !== undefined) data.isNewArrival = input.isNewArrival;
  if (input.isBestSeller !== undefined) data.isBestSeller = input.isBestSeller;
  if (input.blockAddToCart !== undefined) data.blockAddToCart = input.blockAddToCart;
  if (input.blockCheckout !== undefined) data.blockCheckout = input.blockCheckout;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const uploadedImages = (files ?? []).map((f) => saveUploadedFile(f, 'products'));
  if (input.images !== undefined || uploadedImages.length) {
    data.images = { set: [...(input.images ?? existing.images), ...uploadedImages] };
  }

  const product = await prisma.product.update({ where: { id }, data });
  return serializeProduct(product);
}

export async function deleteProduct(id: string): Promise<void> {
  assertUuid(id);
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('Product not found', 404);
  }
  // Reviews (and cart/wishlist items) cascade-delete via the schema relations.
  await prisma.product.delete({ where: { id } });
}

export async function addProductImages(id: string, files: Express.Multer.File[]) {
  if (!files.length) {
    throw new AppError('At least one image file is required', 400);
  }

  assertUuid(id);
  const existing = await prisma.product.findUnique({ where: { id }, select: { images: true } });
  if (!existing) {
    throw new AppError('Product not found', 404);
  }

  const uploaded = files.map((f) => saveUploadedFile(f, 'products'));
  const product = await prisma.product.update({
    where: { id },
    data: { images: { set: [...existing.images, ...uploaded] } },
  });
  return serializeProduct(product);
}
