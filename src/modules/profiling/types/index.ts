import type { BusinessContext } from '../../context-extractor/types';
import type { BusinessModel, BusinessModelConfidence, CompetitiveRelationship } from '../../../semantic/taxonomy';

export type { BusinessModel, BusinessModelConfidence, CompetitiveRelationship };

// ── Profiling target context ──────────────────────────────────────────────────
// Subset of BusinessContext used by the profiling module.
// The discovery route's businessContext field doesn't carry domain/queryId/analyzedAt,
// so we define a narrower interface that covers exactly what profiling needs.

export interface ProfilingTargetContext {
  domain: string;
  companyType: string;
  industry: string;
  niche: string;
  primaryCompetitiveIdentity: string;
  primarySpecialties: string[];
  coreServices: string[];
  targetAudience: string[];
  positioningSummary: string;
  confidence: 'high' | 'medium' | 'low';
}

// ── Competitor profile (AI-extracted) ─────────────────────────────────────────

export interface CompetitorProfile {
  domain: string;
  companyType: string | null;
  industry: string | null;
  niche: string | null;
  primaryCompetitiveIdentity: string | null;
  primarySpecialties: string[];
  coreServices: string[];
  targetAudience: string[];
  positioning: string | null;
  aiConfidence: 'high' | 'medium' | 'low';
  // Authoritative taxonomy — populated when loaded from DB cache.
  // Absent on freshly AI-extracted profiles; scorer always recomputes and persists.
  businessModel?: BusinessModel | null;
  businessModelConfidence?: Partial<BusinessModelConfidence>;
}

// ── Scoring signals (deterministic output) ────────────────────────────────────

export interface MatchedSignals {
  businessTypeMatch: boolean;
  industryMatch: boolean;
  specialtyOverlap: number;    // 0–1 Jaccard similarity
  audienceOverlap: number;     // 0–1 Jaccard similarity
  serviceOverlap: number;      // 0–1 Jaccard similarity
  identitySimilarity: number;  // 0–1 token overlap
  // Semantic layer — optional enrichment from the ontology/taxonomy
  semanticGroups?: string[];          // ontology group IDs matched for the competitor
  taxonomyAlignment?: number;         // 0–1 blended taxonomy alignment (observability)
  // Competitive distance layer
  competitiveDistance?: number;       // 0–1 pure business-model-to-business-model proximity
  competitiveRelationship?: CompetitiveRelationship;  // direct / adjacent / peripheral
}

// Per-signal point contributions — shows exactly how each weight slot contributed.
// Populated by scorer, logged in profiling service, not exposed in API response.
export interface ScoreContributions {
  specialty:     number;  // semanticOverlap * WEIGHTS.specialtyOverlap
  identity:      number;  // identitySimilarity * WEIGHTS.identitySimilarity
  businessModel: number;  // competitiveDistance * WEIGHTS.businessTypeMatch
  industry:      number;  // industryMatch * WEIGHTS.industryMatch
  audience:      number;  // audienceOverlap * WEIGHTS.audienceOverlap
  service:       number;  // serviceOverlap * WEIGHTS.serviceOverlap
}

export interface ScoringResult {
  domain: string;
  profile: CompetitorProfile;
  relevanceScore: number;                     // 0–100
  scoreConfidence: 'high' | 'medium' | 'low';
  matchedSignals: MatchedSignals;
  scoringReasoning: string[];
  // Authoritative normalized taxonomy — always populated by scorer.
  businessModel: BusinessModel;
  businessModelConfidence: BusinessModelConfidence;
  // Score contribution breakdown — used for observability logging.
  scoreContributions: ScoreContributions;
}

// ── Service inputs/outputs ────────────────────────────────────────────────────

export interface ProfilingInput {
  domains: string[];
  targetContext: ProfilingTargetContext;
  queryId: string;
}

export interface ProfilingOutput {
  rankedCompetitors: ScoringResult[];
  profilesExtracted: number;
  profilingSkipped: boolean;
  profilingStats: ProfilingStats;
}

export interface ProfilingStats {
  totalInput: number;
  profilesExtracted: number;
  highRelevance: number;    // score >= 70
  mediumRelevance: number;  // score >= 40
  lowRelevance: number;     // score < 40
  averageScore: number;
  // Profile cache metrics (populated when cache is active)
  cacheHits: number;        // profiles reused from a previous run — no Groq call needed
  cacheMisses: number;      // profiles freshly extracted via Groq
}

// ── Persisted record (mirrors DB shape for saves) ─────────────────────────────

export interface StoredProfile {
  domain: string;
  queryId: string;
  companyType: string | null;
  industry: string | null;
  niche: string | null;
  primaryCompetitiveIdentity: string | null;
  primarySpecialties: string[];
  coreServices: string[];
  targetAudience: string[];
  positioning: string | null;
  aiConfidence: string;
  relevanceScore: number;
  scoreConfidence: string;
  matchedSignals: MatchedSignals;
  scoringReasoning: string[];
  businessModel: BusinessModel | null;
  businessModelConfidence: BusinessModelConfidence;
}

// ── Adapter: converts ProfilingTargetContext into a CompetitorProfile shape ───
// Used to treat the target company identically to competitor profiles during scoring.

export function contextToProfile(ctx: ProfilingTargetContext): CompetitorProfile {
  return {
    domain:                     ctx.domain,
    companyType:                ctx.companyType ?? null,
    industry:                   ctx.industry ?? null,
    niche:                      ctx.niche ?? null,
    primaryCompetitiveIdentity: ctx.primaryCompetitiveIdentity ?? null,
    primarySpecialties:         ctx.primarySpecialties ?? [],
    coreServices:               ctx.coreServices ?? [],
    targetAudience:             ctx.targetAudience ?? [],
    positioning:                ctx.positioningSummary ?? null,
    aiConfidence:               ctx.confidence ?? 'low',
  };
}

// Unused but kept for callers that already have a full BusinessContext.
export function businessContextToProfile(ctx: BusinessContext): CompetitorProfile {
  return contextToProfile({
    domain:                     ctx.domain,
    companyType:                ctx.companyType,
    industry:                   ctx.industry,
    niche:                      ctx.niche,
    primaryCompetitiveIdentity: ctx.primaryCompetitiveIdentity,
    primarySpecialties:         ctx.primarySpecialties,
    coreServices:               ctx.coreServices,
    targetAudience:             ctx.targetAudience,
    positioningSummary:         ctx.positioningSummary,
    confidence:                 ctx.confidence,
  });
}
