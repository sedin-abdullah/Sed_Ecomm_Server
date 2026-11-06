import { prisma } from '../config/prisma';
import type { Coupon } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { toApi } from '../utils/serialize';
import { assertUuid } from '../utils/uuid';
import { CreateCouponInput, UpdateCouponInput } from '../validators/coupon.validator';

/**
 * A date-only expiry (e.g. "2026-07-09") arrives as midnight UTC, which would
 * make the coupon expire at the START of that day. Push it to end-of-day so an
 * "expires on the 9th" coupon is usable through the whole 9th.
 */
function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Normalised coupon with plain-number Decimal fields, shared with cart/order so
 * their eligibility and discount math never touches a Prisma Decimal directly.
 */
export interface UsableCoupon {
  code: string;
  type: 'percentage' | 'flat';
  value: number;
  minOrderValue: number;
  maxDiscount?: number;
  expiresAt: Date;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  minItems: number;
}

export function toUsableCoupon(c: Coupon): UsableCoupon {
  return {
    code: c.code,
    type: c.type,
    value: c.value.toNumber(),
    minOrderValue: c.minOrderValue.toNumber(),
    maxDiscount: c.maxDiscount?.toNumber(),
    expiresAt: c.expiresAt,
    usageLimit: c.usageLimit,
    usedCount: c.usedCount,
    isActive: c.isActive,
    minItems: c.minItems,
  };
}

export interface CouponPreview {
  code: string;
  type: UsableCoupon['type'];
  value: number;
  minOrderValue: number;
  minItems: number;
  maxDiscount?: number;
  expiresAt: Date;
  isValid: boolean;
  reason?: string;
  estimatedDiscount?: number;
}

export async function validateCouponCode(code: string, amount?: number): Promise<CouponPreview> {
  const row = await prisma.coupon.findFirst({ where: { code: code.trim().toUpperCase() } });
  if (!row) {
    throw new AppError('Coupon not found', 404);
  }
  const coupon = toUsableCoupon(row);

  let reason: string | undefined;
  if (!coupon.isActive) reason = 'This coupon is no longer active';
  else if (coupon.expiresAt.getTime() < Date.now()) reason = 'This coupon has expired';
  else if (coupon.usedCount >= coupon.usageLimit) reason = 'This coupon has reached its usage limit';
  else if (amount !== undefined && amount < coupon.minOrderValue) {
    reason = `A minimum order value of ${coupon.minOrderValue} is required`;
  }

  let estimatedDiscount: number | undefined;
  if (!reason && amount !== undefined) {
    let discount = coupon.type === 'flat' ? coupon.value : (amount * coupon.value) / 100;
    if (coupon.maxDiscount !== undefined) discount = Math.min(discount, coupon.maxDiscount);
    estimatedDiscount = Math.round(Math.min(discount, amount) * 100) / 100;
  }

  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrderValue: coupon.minOrderValue,
    minItems: coupon.minItems,
    maxDiscount: coupon.maxDiscount,
    expiresAt: coupon.expiresAt,
    isValid: !reason,
    reason,
    estimatedDiscount,
  };
}

export async function listCoupons() {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  return coupons.map((c) => toApi(c));
}

export async function createCoupon(input: CreateCouponInput) {
  const coupon = await prisma.coupon.create({
    data: {
      code: input.code.toUpperCase(),
      type: input.type,
      value: input.value,
      minOrderValue: input.minOrderValue,
      maxDiscount: input.maxDiscount,
      expiresAt: endOfDay(input.expiresAt),
      usageLimit: input.usageLimit,
      isActive: input.isActive,
      minItems: input.minItems ?? 0,
    },
  });
  return toApi(coupon);
}

export async function updateCoupon(id: string, input: UpdateCouponInput) {
  assertUuid(id);
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('Coupon not found', 404);
  }

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      ...(input.code !== undefined ? { code: input.code.toUpperCase() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.minOrderValue !== undefined ? { minOrderValue: input.minOrderValue } : {}),
      ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: endOfDay(input.expiresAt) } : {}),
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.minItems !== undefined ? { minItems: input.minItems } : {}),
    },
  });
  return toApi(coupon);
}

export async function deleteCoupon(id: string): Promise<void> {
  assertUuid(id);
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('Coupon not found', 404);
  }
  await prisma.coupon.delete({ where: { id } });
}
