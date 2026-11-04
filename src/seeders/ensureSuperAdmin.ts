/**
 * Idempotently ensures a Super Admin account exists (top of the hierarchy:
 * full access + complete activity log + manages Managers/Store Owners).
 * Safe to run on every boot — never wipes data.
 *
 *   CLI:  DATABASE_URL=<uri> npm run ensure-superadmin
 *   Boot: called from server.ts start().
 */
import { connectDB } from '../config/db';
import { prisma } from '../config/prisma';
import { hashPassword } from '../services/user.service';

export const SUPERADMIN_EMAIL = 'superadmin@sedecomm.com';
const SUPERADMIN_PASSWORD = 'Super@123';

export async function ensureSuperAdmin(): Promise<{ created: boolean; email: string }> {
  const existing = await prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL } });
  if (existing) {
    if (existing.role !== 'superadmin') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'superadmin' } });
    }
    return { created: false, email: SUPERADMIN_EMAIL };
  }
  await prisma.user.create({
    data: {
      name: 'Sed Ecomm Super Admin',
      email: SUPERADMIN_EMAIL,
      password: await hashPassword(SUPERADMIN_PASSWORD),
      role: 'superadmin',
      isEmailVerified: true,
      isActive: true,
    },
  });
  return { created: true, email: SUPERADMIN_EMAIL };
}

if (require.main === module) {
  (async () => {
    await connectDB();
    const r = await ensureSuperAdmin();
    console.log(
      r.created
        ? `✅ Super Admin created: ${r.email} (password: ${SUPERADMIN_PASSWORD})`
        : `✅ Super Admin already exists: ${r.email}`,
    );
    await prisma.$disconnect();
  })().catch((err) => {
    console.error('ensure-superadmin failed:', err);
    process.exit(1);
  });
}
