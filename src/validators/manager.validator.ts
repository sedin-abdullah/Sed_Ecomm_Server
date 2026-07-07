import { z } from 'zod';

export const createAdminSchema = z.object({
  // Optional display name; login email + password are auto-generated.
  name: z.string().trim().min(2).max(100).optional(),
});

export const setAdminStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type SetAdminStatusInput = z.infer<typeof setAdminStatusSchema>;
