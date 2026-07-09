import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string({ required_error: 'Coupon code is required' }).trim().min(3).max(30),
  type: z.enum(['percentage', 'flat'], { required_error: 'Coupon type is required' }),
  value: z.coerce.number({ required_error: 'Coupon value is required' }).min(0),
  minOrderValue: z.coerce.number().min(0).optional(),
  maxDiscount: z.coerce.number().min(0).optional(),
  expiresAt: z.coerce.date({ required_error: 'Expiry date is required' }),
  usageLimit: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
  // Value/count-based rule: cart must hold at least this many items (total qty).
  minItems: z.coerce.number().int().min(0).optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
