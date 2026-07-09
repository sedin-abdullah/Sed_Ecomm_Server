import crypto from 'crypto';
import { User, UserRole } from '../models/User';
import { AppError } from '../utils/AppError';

type StaffRole = 'admin' | 'manager'; // admin = Store Owner (UI label)

const ROLE_META: Record<StaffRole, { prefix: string; label: string }> = {
  admin: { prefix: 'owner', label: 'Store Owner' },
  manager: { prefix: 'manager', label: 'Manager' },
};

function randomSuffix(): string {
  return crypto.randomBytes(3).toString('hex');
}

/** Auto-generated, reasonably strong password (letters + digits + symbol). */
function generatePassword(): string {
  const body = crypto.randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
  const digits = crypto.randomInt(10, 99);
  return `Sed-${body}${digits}!`;
}

/**
 * Provision a staff account (Store Owner or Manager) with an auto-generated
 * login email + secure password. Returns the plaintext password ONCE.
 */
export async function createStaff(
  role: StaffRole,
  name?: string,
): Promise<{ id: string; name: string; email: string; password: string; role: UserRole }> {
  const { prefix, label } = ROLE_META[role];
  let email = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    email = `${prefix}_${randomSuffix()}@sedecomm.com`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.exists({ email }))) break;
    email = '';
  }
  if (!email) throw new AppError('Could not generate a unique login, please retry', 500);

  const password = generatePassword();
  const displayName = name?.trim() || `${label} ${email.split('_')[1]?.slice(0, 6) ?? ''}`.trim();

  const user = await User.create({
    name: displayName,
    email,
    password, // hashed by the User pre-save hook
    role,
    isEmailVerified: true,
    isActive: true,
  });

  return { id: String(user._id), name: user.name, email: user.email, password, role: user.role };
}

/** List all accounts of a given staff role (newest first). */
export async function listStaff(role: StaffRole) {
  return User.find({ role }).select('name email isActive createdAt').sort({ createdAt: -1 });
}

/** Enable/disable a staff account. Disabled accounts are blocked at `protect`. */
export async function setStaffStatus(role: StaffRole, id: string, isActive: boolean) {
  const user = await User.findById(id);
  if (!user || user.role !== role) throw new AppError('Account not found', 404);
  user.isActive = isActive;
  await user.save();
  return user;
}
