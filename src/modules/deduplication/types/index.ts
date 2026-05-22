import { AppError } from '../../../lib/errors';

// ── Input ─────────────────────────────────────────────────────────────────────

export interface DeduplicationInput {
  normalizedDomain: string;
  originalValue: string;
  source: string;
  discoveryMethod: string;
  queryId: string;
  discoveredAt: string; // ISO string
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface ProcessedCompetitor {
  normalizedDomain: string;
  competitorId: string;
  source: string;
  discoveryMethod: string;
  queryId: string;
  discoveredAt: string;
}

export interface DeduplicationStats {
  totalProcessed: number;
  newCount: number;
  existingCount: number;
  duplicateCount: number;
}

export interface DeduplicationOutput {
  newCompetitors: ProcessedCompetitor[];
  existingCompetitors: ProcessedCompetitor[];
  /** Within-batch duplicates removed before DB coordination. */
  duplicateDiscoveries: DeduplicationInput[];
  stats: DeduplicationStats;
}

// ── Internal repository records ───────────────────────────────────────────────

export interface CompetitorRecord {
  id: string;
  normalizedDomain: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class DeduplicationError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'DEDUPLICATION_ERROR', 500);
    if (cause) this.cause = cause;
  }
}
