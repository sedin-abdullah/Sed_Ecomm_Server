import { Types } from 'mongoose';
import { z } from 'zod';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');

function toArray(val: unknown): string[] | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Not JSON — fall back to comma-separated parsing (handy for multipart forms).
    }
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

const stringArray = z.preprocess(toArray, z.array(z.string()).optional());
const boolish = z.preprocess(
  (v) => (typeof v === 'string' ? v === 'true' || v === '1' : v),
  z.boolean().optional(),
);

export const createProductSchema = z.object({
  name: z.string({ required_error: 'Product name is required' }).trim().min(2).max(200),
  description: z.string({ required_error: 'Description is required' }).trim().min(10),
  category: objectId,
  brand: z.string().trim().optional(),
  price: z.coerce.number({ required_error: 'Price is required' }).min(0),
  discountPrice: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().min(0).default(0),
  images: stringArray,
  sizes: stringArray,
  colors: stringArray,
  tags: stringArray,
  isFeatured: boolish,
  isFlashSale: boolish,
  flashSaleEndsAt: z.coerce.date().optional(),
  isNewArrival: boolish,
  isBestSeller: boolish,
  isActive: boolish,
});

export const updateProductSchema = createProductSchema.partial();

export const listProductsQuerySchema = z.object({
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popular', 'rating']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  featured: boolish,
  flashSale: boolish,
  newArrival: boolish,
  bestSeller: boolish,
  inStock: boolish,
  onSale: boolish,
  includeInactive: boolish, // admin listing: include disabled products
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
