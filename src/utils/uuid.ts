/**
 * UUID validation, the Postgres-era replacement for Mongoose ObjectId checks.
 *
 * Previously an invalid ObjectId in a query filter raised a Mongoose CastError,
 * which the error handler turned into a 400. Passing a malformed id straight to
 * a Prisma `@db.Uuid` column instead errors at Postgres (a 500), so callers
 * validate the id first and preserve the original 400 behaviour.
 */
import { AppError } from './AppError';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Throws a 400 for a malformed id, preserving the old Mongoose CastError
 * behaviour (an invalid id → 400, not a 500 from Postgres rejecting the uuid).
 */
export function assertUuid(value: string, field = 'id'): void {
  if (!isUuid(value)) {
    throw new AppError(`Invalid value "${value}" for field "${field}"`, 400);
  }
}

export default isUuid;
