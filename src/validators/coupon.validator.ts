import { Types } from 'mongoose';
import { z } from 'zod';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid product id');

export const createCouponSchema = z.object({
  code: z.string({ required_error: 'Coupon code is required' }).trim().min(3).max(30),
  type: z.enum(['percentage', 'flat'], { required_error: 'Coupon type is required' }),
  value: z.coerce.number({ required_error: 'Coupon value is required' }).min(0),
  minOrderValue: z.coerce.number().min(0).optional(),
  maxDiscount: z.coerce.number().min(0).optional(),
  expiresAt: z.coerce.date({ required_error: 'Expiry date is required' }),
  usageLimit: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
  // Optional product scope; empty/omitted = applies to the whole cart.
  applicableProducts: z.array(objectId).optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
