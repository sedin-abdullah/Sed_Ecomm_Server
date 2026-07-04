import { Types } from 'mongoose';
import { z } from 'zod';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');

const variantSchema = z
  .object({
    size: z.string().trim().optional(),
    color: z.string().trim().optional(),
  })
  .optional();

export const addCartItemSchema = z.object({
  productId: objectId,
  variant: variantSchema,
  qty: z.coerce.number().int().min(1).default(1),
});

export const updateCartItemSchema = z.object({
  qty: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
});

export const applyCouponSchema = z.object({
  code: z.string({ required_error: 'Coupon code is required' }).trim().min(1),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
