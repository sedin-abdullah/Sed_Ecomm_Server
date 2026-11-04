/**
 * Idempotently ensures a Manager account exists (the top-level authority who
 * approves Admin actions and provisions Admin accounts). Safe to run on every
 * startup — it never wipes data, only creates the manager if missing.
 *
 *   CLI:   DATABASE_URL=<uri> npm run ensure-manager
 *   Boot:  called from server.ts start() (idempotent).
 */
import { connectDB } from '../config/db';
import { prisma } from '../config/prisma';
import { hashPassword } from '../services/user.service';

export const MANAGER_EMAIL = 'manager@sedecomm.com';
const MANAGER_PASSWORD = 'Manager@123';

export async function ensureManager(): Promise<{ created: boolean; email: string }> {
  const existing = await prisma.user.findUnique({ where: { email: MANAGER_EMAIL } });
  if (existing) {
    if (existing.role !== 'manager') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'manager' } });
    }
    return { created: false, email: MANAGER_EMAIL };
  }
  await prisma.user.create({
    data: {
      name: 'Sed Ecomm Manager',
      email: MANAGER_EMAIL,
      password: await hashPassword(MANAGER_PASSWORD),
      role: 'manager',
      isEmailVerified: true,
      isActive: true,
    },
  });
  return { created: true, email: MANAGER_EMAIL };
}

if (require.main === module) {
  (async () => {
    await connectDB();
    const r = await ensureManager();
    console.log(
      r.created
        ? `✅ Manager created: ${r.email} (password: ${MANAGER_PASSWORD})`
        : `✅ Manager already exists: ${r.email}`,
    );
    await prisma.$disconnect();
  })().catch((err) => {
    console.error('ensure-manager failed:', err);
    process.exit(1);
  });
}
