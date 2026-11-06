import { toClientImages } from './productImage';
import { toApi } from './serialize';

/**
 * Serializes a (usually partial) product row for embedding inside cart /
 * wishlist responses: adds `_id`, converts Decimal prices/rating to numbers,
 * and turns the stored image URL strings into `{id, url}` objects — matching
 * the old Mongoose `populate` + `toJSON` output.
 */
export function serializeProductSummary(
  product: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!product) return null;
  const api = toApi(product) as Record<string, unknown>;
  return { ...api, images: toClientImages((product.images as string[] | undefined) ?? []) };
}

export default serializeProductSummary;
