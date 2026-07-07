import crypto from 'crypto';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';

/** Random 6-hex suffix, e.g. "a1b2c3". */
function randomSuffix(): string {
  return crypto.randomBytes(3).toString('hex');
}

/** Auto-generated, reasonably strong password (letters + digits + symbol). */
function generatePassword(): string {
  const body = crypto.randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
  const digits = crypto.randomInt(10, 99);
  return `Adm-${body}${digits}!`;
}

/**
 * Manager-only: provision a new Admin account with an auto-generated login
 * (email/username) and secure password. Returns the plaintext password ONCE so
 * the manager can copy/share it — it's stored only as a hash.
 */
export async function createAdmin(
  name?: string,
): Promise<{ id: string; name: string; email: string; password: string }> {
  // Generate a unique login email.
  let email = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    email = `admin_${randomSuffix()}@sedecomm.com`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.exists({ email }))) break;
    email = '';
  }
  if (!email) throw new AppError('Could not generate a unique admin login, please retry', 500);

  const password = generatePassword();
  const displayName = name?.trim() || `Admin ${email.slice(6, 12)}`;

  const user = await User.create({
    name: displayName,
    email,
    password, // hashed by the User pre-save hook
    role: 'admin',
    isEmailVerified: true,
    isActive: true,
  });

  return { id: String(user._id), name: user.name, email: user.email, password };
}

/** List all admin accounts (newest first) for the management table. */
export async function listAdmins() {
  return User.find({ role: 'admin' }).select('name email isActive createdAt').sort({ createdAt: -1 });
}

/** Enable/disable an admin account. Disabled admins are blocked at `protect`. */
export async function setAdminStatus(id: string, isActive: boolean) {
  const user = await User.findById(id);
  if (!user || user.role !== 'admin') throw new AppError('Admin not found', 404);
  user.isActive = isActive;
  await user.save();
  return user;
}
