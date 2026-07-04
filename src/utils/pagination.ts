export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Parses `page`/`limit` query params (already coerced by zod where possible)
 * into safe, bounded pagination parameters.
 */
export function parsePagination(query: PaginationQuery, defaultLimit = 20, maxLimit = 100): PaginationParams {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Math.trunc(Number(query.limit)) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export default parsePagination;
