import { Prisma } from '../generated/prisma/client';

/**
 * Recursively prepares a Prisma result for the API response so the frontend
 * (built against the old Mongoose/Mongo shape) needs no changes:
 *
 *  - every object that has an `id` also gets an `_id` with the same value,
 *    including nested/related objects;
 *  - every Prisma `Decimal` is converted to a plain JavaScript `number`.
 *
 * `Date` values are left untouched. The input is not mutated — a new structure
 * is returned.
 */
function transform(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toNumber();
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(transform);
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(source)) {
      out[key] = transform(source[key]);
    }

    if ('id' in source && source.id !== undefined && out._id === undefined) {
      out._id = source.id;
    }

    return out;
  }

  return value;
}

export function toApi<T>(value: T): T {
  return transform(value) as T;
}

export default toApi;
