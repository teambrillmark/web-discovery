import { z } from 'zod';

const QualificationResultItemSchema = z.object({
  domain: z.string().min(1),
  entityType: z.enum([
    'agency', 'saas', 'tool', 'marketplace', 'directory',
    'infrastructure', 'community', 'media', 'ecommerce',
    'job-board', 'app-store', 'unknown',
  ]).default('unknown'),
  relevance: z.enum(['direct', 'adjacent', 'irrelevant']).default('direct'),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const AIQualificationResponseSchema = z.object({
  results: z.array(QualificationResultItemSchema).default([]),
});

export type AIQualificationItem = z.infer<typeof QualificationResultItemSchema>;
export type AIQualificationResponse = z.infer<typeof AIQualificationResponseSchema>;
