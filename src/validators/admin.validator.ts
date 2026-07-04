import { z } from 'zod';

export const setCustomerStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type SetCustomerStatusInput = z.infer<typeof setCustomerStatusSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
