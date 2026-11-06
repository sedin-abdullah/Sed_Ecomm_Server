import { prisma } from './prisma';

/**
 * Opens the PostgreSQL connection (via Prisma) and verifies it with a trivial
 * query before the server starts accepting traffic. Mirrors the previous
 * Mongoose `connectDB`: fail fast and exit(1) if the database is unreachable.
 */
export async function connectDB(): Promise<void> {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('[db] PostgreSQL connected via Prisma');
  } catch (error) {
    console.error('[db] PostgreSQL connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export default connectDB;
