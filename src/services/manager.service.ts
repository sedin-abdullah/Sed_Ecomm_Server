import crypto from 'crypto';
import { prisma } from '../config/prisma';
import type { UserRole } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { toApi } from '../utils/serialize';
import { assertUuid } from '../utils/uuid';
import { hashPassword } from './user.service';

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
    const candidate = `${prefix}_${randomSuffix()}@sedecomm.com`;
    // eslint-disable-next-line no-await-in-loop
    const taken = await prisma.user.findUnique({ where: { email: candidate }, select: { id: true } });
    if (!taken) {
      email = candidate;
      break;
    }
  }
  if (!email) throw new AppError('Could not generate a unique login, please retry', 500);

  const password = generatePassword();
  const displayName = name?.trim() || `${label} ${email.split('_')[1]?.slice(0, 6) ?? ''}`.trim();

  const user = await prisma.user.create({
    data: {
      name: displayName,
      email,
      password: await hashPassword(password),
      role,
      isEmailVerified: true,
      isActive: true,
    },
  });

  return { id: user.id, name: user.name, email: user.email, password, role: user.role };
}

/** List all accounts of a given staff role (newest first). */
export async function listStaff(role: StaffRole) {
  const users = await prisma.user.findMany({
    where: { role },
    select: { id: true, name: true, email: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return users.map((u) => toApi(u));
}

/** Enable/disable a staff account. Disabled accounts are blocked at `protect`. */
export async function setStaffStatus(role: StaffRole, id: string, isActive: boolean) {
  assertUuid(id);
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user || user.role !== role) throw new AppError('Account not found', 404);
  const updated = await prisma.user.update({ where: { id }, data: { isActive } });
  return toApi(updated);
}
