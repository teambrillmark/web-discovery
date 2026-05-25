import { z } from 'zod';

const BusinessContextSchema = z.object({
  companyType: z.string(),
  category: z.string().default('Unknown'),
  industry: z.string(),
  niche: z.string(),
  // Competitive intelligence fields (optional for backward compat with older callers)
  primaryCompetitiveIdentity: z.string().default('Unknown'),
  primarySpecialties: z.array(z.string()).default([]),
  secondaryCapabilities: z.array(z.string()).default([]),
  coreServices: z.array(z.string()).default([]),
  competitiveSurfaces: z.array(z.string()).default([]),
  competitorSearchQueries: z.array(z.string()).default([]),
  services: z.array(z.string()),
  targetAudience: z.array(z.string()),
  positioningSummary: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const DiscoveryInputSchema = z.object({
  normalizedDomain: z
    .string({ required_error: 'normalizedDomain is required' })
    .min(1, 'normalizedDomain cannot be empty')
    .max(255),
  exclusions: z.array(z.string().min(1)).default([]),
  queryId: z.string().uuid('queryId must be a valid UUID'),
  businessContext: BusinessContextSchema.optional(),
});

// Accept any string from the AI — empty strings and invalid domains
// are filtered by isDomainLike() in the provider, not here.
export const AICompetitorResponseSchema = z.object({
  competitors: z.array(z.string()).max(100).default([]),
});

export type ValidatedDiscoveryInput = z.infer<typeof DiscoveryInputSchema>;
export type ValidatedAICompetitorResponse = z.infer<typeof AICompetitorResponseSchema>;
