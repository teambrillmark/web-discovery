// Canonical domain normalization and validation live in src/shared/domain.
// This file re-exports them and provides isDomainLike as a convenience check.
export { normalizeDomain } from '../../../shared/domain';
export type { NormalizationOutcome } from '../../../shared/domain';

import { normalizeDomain } from '../../../shared/domain';

/**
 * Returns true only when the input normalizes to a valid domain.
 * Replaces the old isDomainLike + normalizeDomainForComparison pair —
 * one function, one behavior, backed by the canonical implementation.
 */
export function isDomainLike(value: string): boolean {
  return normalizeDomain(value).ok;
}
