import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma';
import type { ApiAddress, PublicUser } from '../types/user';
import { AppError } from '../utils/AppError';
import { toApi } from '../utils/serialize';
import { isUuid } from '../utils/uuid';
import { CreateAddressInput, UpdateAddressInput, UpdateMeInput } from '../validators/user.validator';

const SALT_ROUNDS = 12;

/**
 * Password hashing helpers. These replace the Mongoose `pre('save')` hook: any
 * code path that sets or changes a user's password must hash it through here.
 */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function updateMe(userId: string, input: UpdateMeInput): Promise<PublicUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
    },
  });
  return toApi(user) as PublicUser;
}

export async function listAddresses(userId: string): Promise<ApiAddress[]> {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return toApi(addresses) as ApiAddress[];
}

export async function createAddress(userId: string, input: CreateAddressInput): Promise<ApiAddress> {
  if (input.isDefault) {
    await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  const address = await prisma.address.create({ data: { ...input, userId } });
  return toApi(address) as ApiAddress;
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
): Promise<ApiAddress> {
  if (!isUuid(addressId)) {
    throw new AppError(`Invalid value "${addressId}" for field "id"`, 400);
  }

  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) {
    throw new AppError('Address not found', 404);
  }

  if (input.isDefault) {
    await prisma.address.updateMany({
      where: { userId, id: { not: addressId } },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.update({ where: { id: addressId }, data: input });
  return toApi(address) as ApiAddress;
}

export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  if (!isUuid(addressId)) {
    throw new AppError(`Invalid value "${addressId}" for field "id"`, 400);
  }

  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) {
    throw new AppError('Address not found', 404);
  }
  await prisma.address.delete({ where: { id: addressId } });
}
