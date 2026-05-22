export { DeduplicationEngineService } from './services/deduplication-engine.service';
export { CompetitorDedupRepository } from './repositories/competitor.dedup.repository';
export type { ICompetitorDedupRepository } from './repositories/competitor.dedup.repository';
export { DeduplicationInputSchema, DeduplicationInputItemSchema } from './validators/deduplication.validator';
export type {
  DeduplicationInput,
  DeduplicationOutput,
  ProcessedCompetitor,
  DeduplicationStats,
  CompetitorRecord,
} from './types';
export { DeduplicationError } from './types';
