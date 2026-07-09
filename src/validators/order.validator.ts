import { Types } from 'mongoose';
import { z } from 'zod';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');

const orderItemInput = z.object({
  productId: objectId,
  qty: z.coerce.number().int().min(1),
  variant: z
    .object({
      size: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
});

export const createOrderSchema = z.object({
  addressId: objectId,
  // Optional: pick specific items to check out (e.g. "buy now"). When omitted,
  // every non-saved-for-later item currently in the user's cart is used.
  items: z.array(orderItemInput).optional(),
  couponCode: z.string().trim().optional(),
  paymentMethod: z.enum(['card_credit', 'card_debit', 'upi', 'netbanking', 'wallet', 'cod'], {
    required_error: 'Payment method is required',
  }),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'returned',
    'payment_failed',
  ]),
  note: z.string().trim().max(500).optional(),
});

export const listOrdersQuerySchema = z.object({
  status: z
    .enum([
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'returned',
      'payment_failed',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const requestRefundSchema = z.object({
  reason: z.string({ required_error: 'A refund reason is required' }).trim().min(3).max(200),
  comments: z.string().trim().max(1000).optional(),
});

export const processRefundSchema = z.object({
  method: z.enum(['card', 'upi', 'cash'], { required_error: 'Refund method is required' }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
export type ProcessRefundInput = z.infer<typeof processRefundSchema>;
