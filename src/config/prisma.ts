import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

// Prisma 7 requires a driver adapter. We use the node-postgres (`pg`) adapter.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/**
 * The single, shared PrismaClient for the whole app. Import this everywhere
 * instead of constructing new clients (each client opens its own connection pool).
 *
 * `omit` reproduces the old Mongoose `select: false` behaviour: password and the
 * password-reset columns are never returned unless a query opts back in with
 * `omit: { password: false }` (the Prisma equivalent of `.select('+password')`).
 */
export const prisma = new PrismaClient({
  adapter,
  omit: {
    user: {
      password: true,
      passwordResetToken: true,
      passwordResetExpires: true,
    },
  },
});

export default prisma;
