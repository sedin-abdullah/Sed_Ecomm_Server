/**
 * Idempotently ensures a Manager account exists (the top-level authority who
 * approves Admin actions and provisions Admin accounts). Safe to run on every
 * startup — it never wipes data, only creates the manager if missing.
 *
 *   CLI:   MONGODB_URI=<uri> npm run ensure-manager
 *   Boot:  called from server.ts start() (idempotent).
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { User } from '../models/User';

export const MANAGER_EMAIL = 'manager@sedecomm.com';
const MANAGER_PASSWORD = 'Manager@123';

export async function ensureManager(): Promise<{ created: boolean; email: string }> {
  const existing = await User.findOne({ email: MANAGER_EMAIL });
  if (existing) {
    if (existing.role !== 'manager') {
      existing.role = 'manager';
      await existing.save();
    }
    return { created: false, email: MANAGER_EMAIL };
  }
  await User.create({
    name: 'Sed Ecomm Manager',
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD, // hashed by the User pre-save hook
    role: 'manager',
    isEmailVerified: true,
    isActive: true,
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
    await mongoose.disconnect();
  })().catch((err) => {
    console.error('ensure-manager failed:', err);
    process.exit(1);
  });
}
