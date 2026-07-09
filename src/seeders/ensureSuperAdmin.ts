/**
 * Idempotently ensures a Super Admin account exists (top of the hierarchy:
 * full access + complete activity log + manages Managers/Store Owners).
 * Safe to run on every boot — never wipes data.
 *
 *   CLI:  MONGODB_URI=<uri> npm run ensure-superadmin
 *   Boot: called from server.ts start().
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { User } from '../models/User';

export const SUPERADMIN_EMAIL = 'superadmin@sedecomm.com';
const SUPERADMIN_PASSWORD = 'Super@123';

export async function ensureSuperAdmin(): Promise<{ created: boolean; email: string }> {
  const existing = await User.findOne({ email: SUPERADMIN_EMAIL });
  if (existing) {
    if (existing.role !== 'superadmin') {
      existing.role = 'superadmin';
      await existing.save();
    }
    return { created: false, email: SUPERADMIN_EMAIL };
  }
  await User.create({
    name: 'Sed Ecomm Super Admin',
    email: SUPERADMIN_EMAIL,
    password: SUPERADMIN_PASSWORD, // hashed by the User pre-save hook
    role: 'superadmin',
    isEmailVerified: true,
    isActive: true,
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
    await mongoose.disconnect();
  })().catch((err) => {
    console.error('ensure-superadmin failed:', err);
    process.exit(1);
  });
}
