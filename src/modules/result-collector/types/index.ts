import { AppError } from '../../../lib/errors';

// Outcome types are owned by shared/domain — the canonical source of truth.
export type { NormalizationOutcome, ValidationOutcome } from '../../../shared/domain';

// ── Input ─────────────────────────────────────────────────────────────────────

export interface RawProviderResult {
  domain: string;
  source: string;
  discoveryMethod: string;
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface NormalizedResult {
  normalizedDomain: string;
  originalValue: string;
  source: string;
  discoveryMethod: string;
  queryId: string;
  discoveredAt: string;
}

// ── Batch stats ───────────────────────────────────────────────────────────────

export interface CollectionStats {
  inputCount: number;
  normalizedCount: number;
  rejectedCount: number;
  duplicatesRemovedCount: number;
  rejectionReasons: Record<string, number>;
}

export interface CollectionOutput {
  results: NormalizedResult[];
  stats: CollectionStats;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class ResultCollectorError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'RESULT_COLLECTOR_ERROR', 500);
    if (cause) this.cause = cause;
  }
}
