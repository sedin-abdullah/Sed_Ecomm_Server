import { z } from 'zod';

export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  avatar: z.string().trim().optional(),
});

export const createAddressSchema = z.object({
  fullName: z.string({ required_error: 'Full name is required' }).trim().min(2),
  phone: z.string({ required_error: 'Phone number is required' }).trim().min(5),
  line1: z.string({ required_error: 'Address line 1 is required' }).trim().min(2),
  line2: z.string().trim().optional(),
  city: z.string({ required_error: 'City is required' }).trim().min(1),
  state: z.string({ required_error: 'State is required' }).trim().min(1),
  postalCode: z.string({ required_error: 'Postal code is required' }).trim().min(1),
  country: z.string({ required_error: 'Country is required' }).trim().min(1),
  isDefault: z.coerce.boolean().optional(),
  type: z.enum(['shipping', 'billing']).optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
