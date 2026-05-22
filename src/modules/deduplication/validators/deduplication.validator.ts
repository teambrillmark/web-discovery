import { z } from 'zod';

export const DeduplicationInputItemSchema = z.object({
  normalizedDomain: z
    .string()
    .min(1, 'normalizedDomain is required')
    .max(253, 'normalizedDomain exceeds max length')
    .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/, 'normalizedDomain must be a valid lowercase domain'),
  originalValue: z.string().min(1, 'originalValue is required').max(2048),
  source: z.string().min(1, 'source is required').max(100),
  discoveryMethod: z.string().min(1, 'discoveryMethod is required').max(100),
  queryId: z.string().uuid('queryId must be a valid UUID'),
  discoveredAt: z.string().datetime({ message: 'discoveredAt must be a valid ISO 8601 datetime' }),
});

export const DeduplicationInputSchema = z.array(DeduplicationInputItemSchema);

export type ValidatedDeduplicationInput = z.infer<typeof DeduplicationInputItemSchema>;
