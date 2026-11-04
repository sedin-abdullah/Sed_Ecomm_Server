import { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env';
import { AppError } from '../utils/AppError';

interface PrismaUniqueConstraintError extends Error {
  code: 'P2002';
  meta?: {
    // Standard shape (no driver adapter): the offending column(s).
    target?: string[] | string;
    // Driver-adapter (pg) shape: the violated constraint, from which we recover the field.
    driverAdapterError?: { cause?: { table?: string; constraint?: { index?: string } } };
  };
}

// Prisma's unique-constraint violation (P2002) is the Postgres equivalent of
// Mongo's 11000 duplicate-key error. We surface it with the same 409 + message.
function isPrismaUniqueError(err: unknown): err is PrismaUniqueConstraintError {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function prismaUniqueField(err: PrismaUniqueConstraintError): string {
  const target = err.meta?.target;
  if (Array.isArray(target)) return target[0] ?? 'field';
  if (typeof target === 'string' && target) return target;

  // With the pg driver adapter, `target` is absent; derive the field from the
  // constraint index name (e.g. `categories_name_key` + table `categories` → `name`).
  const cause = err.meta?.driverAdapterError?.cause;
  const index = cause?.constraint?.index;
  if (index) {
    let field = index;
    if (cause?.table && field.startsWith(`${cause.table}_`)) {
      field = field.slice(cause.table.length + 1);
    }
    field = field.replace(/_(key|pkey)$/, '');
    if (field) return field;
  }

  return 'field';
}

/**
 * Centralized Express error handler. Must be registered last, after all
 * routes and the notFound middleware. Produces the contract's
 * `{ success: false, message, errors? }` response shape.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: unknown[] | undefined;

  if (isPrismaUniqueError(err)) {
    statusCode = 409;
    message = `Duplicate value for "${prismaUniqueField(err)}". Please use another value.`;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof Error) {
    message = isProduction ? message : err.message;
  }

  if (!isProduction && !(err instanceof AppError && err.isOperational)) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
    ...(!isProduction && err instanceof Error ? { stack: err.stack } : {}),
  });
}

export default errorHandler;
