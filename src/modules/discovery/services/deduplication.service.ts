import type { Logger } from '../../../lib/logger';
import type { ProviderResult } from '../types';
import { normalizeDomain, validateDomain } from '../../../shared/domain';

export class DeduplicationService {
  constructor(private readonly logger: Logger) {}

  deduplicate(results: ProviderResult[]): ProviderResult[] {
    const seen = new Set<string>();
    const deduplicated: ProviderResult[] = [];

    for (const result of results) {
      const normOutcome = normalizeDomain(result.domain);
      if (!normOutcome.ok) {
        this.logger.warn({ domain: result.domain, provider: result.source }, 'Skipping invalid domain from provider');
        continue;
      }

      const valOutcome = validateDomain(normOutcome.domain);
      if (!valOutcome.ok) {
        this.logger.warn({ domain: result.domain, provider: result.source }, 'Skipping invalid domain from provider');
        continue;
      }

      const normalized = normOutcome.domain;

      if (seen.has(normalized)) continue;

      seen.add(normalized);
      deduplicated.push({ ...result, domain: normalized });
    }

    this.logger.debug(
      { inputCount: results.length, outputCount: deduplicated.length, removedDuplicates: results.length - deduplicated.length },
      'Deduplication complete',
    );

    return deduplicated;
  }

  filterExclusions(results: ProviderResult[], exclusions: string[]): ProviderResult[] {
    if (exclusions.length === 0) return results;

    const exclusionSet = new Set<string>();
    for (const excl of exclusions) {
      const outcome = normalizeDomain(excl);
      if (outcome.ok) exclusionSet.add(outcome.domain);
    }

    const filtered = results.filter((r) => {
      const outcome = normalizeDomain(r.domain);
      if (!outcome.ok) return true;
      return !exclusionSet.has(outcome.domain);
    });

    const removedCount = results.length - filtered.length;
    if (removedCount > 0) {
      this.logger.debug(
        { removedByExclusion: removedCount, totalExclusions: exclusions.length },
        'Exclusion filtering complete',
      );
    }

    return filtered;
  }
}
