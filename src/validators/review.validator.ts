import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.coerce.number({ required_error: 'Rating is required' }).min(1).max(5),
  comment: z
    .string({ required_error: 'Comment is required' })
    .trim()
    .min(2, 'Comment must be at least 2 characters')
    .max(2000, 'Comment cannot exceed 2000 characters'),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
