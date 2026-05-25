import { z } from 'zod';

const CompetitorProfileSchema = z.object({
  domain: z.string().min(1),
  companyType: z.string().min(1).max(100).nullable().default(null),
  industry: z.string().min(1).max(200).nullable().default(null),
  niche: z.string().min(1).max(300).nullable().default(null),
  primaryCompetitiveIdentity: z.string().min(1).max(300).nullable().default(null),
  primarySpecialties: z.array(z.string().min(1).max(200)).max(6).default([]),
  coreServices: z.array(z.string().min(1).max(200)).max(8).default([]),
  targetAudience: z.array(z.string().min(1).max(200)).max(6).default([]),
  positioning: z.string().max(500).nullable().default(null),
  confidence: z.enum(['high', 'medium', 'low']).default('low'),
});

export const AIProfileResponseSchema = z.object({
  profiles: z.array(CompetitorProfileSchema),
});

export type AIProfileResponse = z.infer<typeof AIProfileResponseSchema>;
export type AICompetitorProfile = z.infer<typeof CompetitorProfileSchema>;
