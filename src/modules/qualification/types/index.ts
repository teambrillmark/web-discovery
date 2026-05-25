import { AppError } from '../../../lib/errors';
import type { NormalizedResult } from '../../result-collector/types';

// ── Entity types ──────────────────────────────────────────────────────────────
// Lightweight classification — describes WHAT kind of entity a domain is,
// not a full profile. Used to explain WHY a candidate was accepted/rejected.

export type EntityType =
  | 'agency'
  | 'saas'
  | 'tool'
  | 'marketplace'
  | 'directory'
  | 'infrastructure'
  | 'community'
  | 'media'
  | 'ecommerce'
  | 'job-board'
  | 'app-store'
  | 'unknown';

export type RelevanceType = 'direct' | 'adjacent' | 'irrelevant';

// Stage that caught the rejection — used to analyze filter quality over time.
// rule-filter = fast cheap rules; ai-validation = Groq determined irrelevance.
export type RejectionStage = 'rule-filter' | 'ai-validation';

// ── Qualification input ───────────────────────────────────────────────────────

// Qualification receives the same NormalizedResult shape that ResultCollector produces.
export type QualificationCandidate = NormalizedResult;

// Minimal business context fields needed to make qualification decisions.
// Kept narrow so this module doesn't depend on the full BusinessContext type.
export interface QualificationContext {
  primaryCompetitiveIdentity: string;
  primarySpecialties: string[];
  industry: string;
  niche: string;
}

// ── Per-candidate result ──────────────────────────────────────────────────────

export interface QualificationResult {
  domain: string;
  accepted: boolean;
  classification: EntityType;
  relevance: RelevanceType;
  confidence: number;
  rejectionReason?: string;
  rejectionStage?: RejectionStage;
}

// ── Batch output ──────────────────────────────────────────────────────────────

export interface QualificationOutput {
  // Only accepted candidates reach the deduplication engine.
  accepted: NormalizedResult[];
  // Rejected candidates are persisted for intelligence / audit.
  rejected: RejectedCandidateRecord[];
  stats: QualificationStats;
}

export interface RejectedCandidateRecord {
  domain: string;
  queryId: string;
  rejectionReason: string;
  rejectionStage: RejectionStage;
  classification: EntityType;
  relevance: RelevanceType | null;
  confidence: number;
  provider: string | null;
  rejectedAt: string;    // ISO string
}

export interface QualificationStats {
  totalInput: number;
  accepted: number;
  rejected: number;
  rejectedByRules: number;
  rejectedByAI: number;
  directCompetitors: number;
  adjacentCompetitors: number;
  rejectionReasons: Record<string, number>;
  classificationBreakdown: Partial<Record<EntityType, number>>;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class QualificationError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUALIFICATION_ERROR', 500);
    if (cause) this.cause = cause;
  }
}
