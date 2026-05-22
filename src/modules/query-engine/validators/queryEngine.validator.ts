import { z } from 'zod';

export const QueryEngineInputSchema = z.object({
  query: z
    .string({ required_error: 'query is required' })
    .min(1, 'query cannot be empty')
    .max(2048, 'query is too long')
    .trim(),
});

export type ValidatedQueryEngineInput = z.infer<typeof QueryEngineInputSchema>;
