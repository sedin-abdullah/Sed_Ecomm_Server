import { Coupon, ICoupon } from '../models/Coupon';
import { AppError } from '../utils/AppError';
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

/** True when the coupon only applies to specific products (not the whole cart). */
export function isProductScoped(coupon: Pick<ICoupon, 'applicableProducts'>): boolean {
  return Array.isArray(coupon.applicableProducts) && coupon.applicableProducts.length > 0;
}

/**
 * Subtotal the discount applies to: the whole cart for an unscoped coupon, or
 * just the line totals of the coupon's applicable products otherwise.
 */
export function couponEligibleSubtotal(
  coupon: Pick<ICoupon, 'applicableProducts'>,
  items: { productId: string; lineTotal: number }[],
): number {
  if (!isProductScoped(coupon)) return items.reduce((s, i) => s + i.lineTotal, 0);
  const allowed = new Set(coupon.applicableProducts.map((id) => String(id)));
  return items.filter((i) => allowed.has(i.productId)).reduce((s, i) => s + i.lineTotal, 0);
}

export interface CouponPreview {
  code: string;
  type: ICoupon['type'];
  value: number;
  minOrderValue: number;
  maxDiscount?: number;
  expiresAt: Date;
  isValid: boolean;
  reason?: string;
  estimatedDiscount?: number;
}

export async function validateCouponCode(code: string, amount?: number): Promise<CouponPreview> {
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
  if (!coupon) {
    throw new AppError('Coupon not found', 404);
  }

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
    maxDiscount: coupon.maxDiscount,
    expiresAt: coupon.expiresAt,
    isValid: !reason,
    reason,
    estimatedDiscount,
  };
}

export async function listCoupons(): Promise<ICoupon[]> {
  return Coupon.find().sort({ createdAt: -1 });
}

export async function createCoupon(input: CreateCouponInput): Promise<ICoupon> {
  return Coupon.create({
    code: input.code.toUpperCase(),
    type: input.type,
    value: input.value,
    minOrderValue: input.minOrderValue,
    maxDiscount: input.maxDiscount,
    expiresAt: endOfDay(input.expiresAt),
    usageLimit: input.usageLimit,
    isActive: input.isActive,
    applicableProducts: input.applicableProducts ?? [],
  });
}

export async function updateCoupon(id: string, input: UpdateCouponInput): Promise<ICoupon> {
  const coupon = await Coupon.findById(id);
  if (!coupon) {
    throw new AppError('Coupon not found', 404);
  }

  if (input.code !== undefined) coupon.code = input.code.toUpperCase();
  if (input.type !== undefined) coupon.type = input.type;
  if (input.value !== undefined) coupon.value = input.value;
  if (input.minOrderValue !== undefined) coupon.minOrderValue = input.minOrderValue;
  if (input.maxDiscount !== undefined) coupon.maxDiscount = input.maxDiscount;
  if (input.expiresAt !== undefined) coupon.expiresAt = endOfDay(input.expiresAt);
  if (input.usageLimit !== undefined) coupon.usageLimit = input.usageLimit;
  if (input.isActive !== undefined) coupon.isActive = input.isActive;
  if (input.applicableProducts !== undefined) {
    coupon.applicableProducts = input.applicableProducts as unknown as ICoupon['applicableProducts'];
  }

  await coupon.save();
  return coupon;
}

export async function deleteCoupon(id: string): Promise<void> {
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) {
    throw new AppError('Coupon not found', 404);
  }
}
