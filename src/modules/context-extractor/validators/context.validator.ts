import { z } from 'zod';

export const ContextExtractorInputSchema = z.object({
  domain: z
    .string({ required_error: 'domain is required' })
    .min(1, 'domain cannot be empty')
    .max(255),
  queryId: z.string().uuid('queryId must be a valid UUID'),
});

export const AIBusinessContextSchema = z.object({
  companyType: z.string().min(1).max(100).default('Unknown'),
  industry: z.string().min(1).max(200).default('Unknown'),
  niche: z.string().min(1).max(300).default('Unknown'),
  services: z.array(z.string().min(1).max(200)).max(20).default([]),
  targetAudience: z.array(z.string().min(1).max(200)).max(10).default([]),
  positioningSummary: z.string().max(1000).default(''),
  extractedContentSummary: z.string().max(500).default(''),
  confidence: z.enum(['high', 'medium', 'low']).default('low'),
});

export type ValidatedContextInput = z.infer<typeof ContextExtractorInputSchema>;
export type ValidatedAIBusinessContext = z.infer<typeof AIBusinessContextSchema>;
