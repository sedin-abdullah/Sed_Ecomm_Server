import { Response } from 'express';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SuccessPayload<T> {
  data?: T;
  message?: string;
  pagination?: PaginationMeta;
}

/**
 * Sends a response in the shape mandated by the API contract:
 * `{ success: true, data?, message?, pagination? }`
 */
export function sendResponse<T>(res: Response, statusCode: number, payload: SuccessPayload<T> = {}): void {
  res.status(statusCode).json({
    success: true,
    ...payload,
  });
}

export default sendResponse;
