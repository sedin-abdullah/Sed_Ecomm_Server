import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const tables = await prisma.$queryRaw<{ table: string }[]>`
    SELECT tablename AS table FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename`;
  const counts: Record<string, number> = {};
  for (const { table } of tables) {
    const [{ c }] = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT COUNT(*) AS c FROM "${table}"`);
    counts[table] = Number(c);
  }
  console.table(counts);
}

main().finally(() => prisma.$disconnect());
