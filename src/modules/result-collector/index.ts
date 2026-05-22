export { ResultCollectorService } from './services/result-collector.service';
export { normalizeDomain } from './normalizers/domain.normalizer';
export { validateDomain } from './validators/domain.validator';
export type {
  RawProviderResult,
  NormalizedResult,
  CollectionStats,
  CollectionOutput,
  NormalizationOutcome,
  ValidationOutcome,
} from './types';
export { ResultCollectorError } from './types';
