import type { Logger } from '../../../lib/logger';
import type {
  RawProviderResult,
  NormalizedResult,
  CollectionOutput,
  CollectionStats,
} from '../types';
import { normalizeDomain } from '../normalizers/domain.normalizer';
import { validateDomain } from '../validators/domain.validator';

export class ResultCollectorService {
  constructor(private readonly logger: Logger) {}

  /**
   * Processes a batch of raw provider results into clean, deduplicated,
   * metadata-stamped NormalizedResult records.
   *
   * Order of operations per item:
   *   1. Normalize  — extract root domain from any URL/string form
   *   2. Validate   — enforce domain-format rules (no IPs, no localhost, etc.)
   *   3. Deduplicate — skip items whose normalized domain was already seen
   *   4. Stamp       — add queryId and discoveredAt
   */
  collect(raw: RawProviderResult[], queryId: string): CollectionOutput {
    const discoveredAt = new Date().toISOString();
    const seen = new Set<string>();
    const results: NormalizedResult[] = [];

    const stats: CollectionStats = {
      inputCount: raw.length,
      normalizedCount: 0,
      rejectedCount: 0,
      duplicatesRemovedCount: 0,
      rejectionReasons: {},
    };

    for (const item of raw) {
      // ── 1. Normalize ──────────────────────────────────────────────────────
      const normOutcome = normalizeDomain(item.domain);

      if (!normOutcome.ok) {
        this.recordRejection(stats, normOutcome.reason, item.domain, item.source);
        continue;
      }

      const domain = normOutcome.domain;

      // ── 2. Validate ───────────────────────────────────────────────────────
      const valOutcome = validateDomain(domain);

      if (!valOutcome.ok) {
        this.recordRejection(stats, valOutcome.reason, item.domain, item.source);
        continue;
      }

      // ── 3. Deduplicate ────────────────────────────────────────────────────
      if (seen.has(domain)) {
        stats.duplicatesRemovedCount++;
        this.logger.debug(
          { domain, originalValue: item.domain, source: item.source, queryId },
          'ResultCollector: duplicate removed',
        );
        continue;
      }
      seen.add(domain);

      // ── 4. Stamp & collect ────────────────────────────────────────────────
      results.push({
        normalizedDomain: domain,
        originalValue: item.domain,
        source: item.source,
        discoveryMethod: item.discoveryMethod,
        queryId,
        discoveredAt,
      });

      stats.normalizedCount++;
    }

    this.logger.info(
      {
        queryId,
        inputCount: stats.inputCount,
        normalizedCount: stats.normalizedCount,
        rejectedCount: stats.rejectedCount,
        duplicatesRemovedCount: stats.duplicatesRemovedCount,
        rejectionReasons: stats.rejectionReasons,
      },
      'ResultCollector: batch processed',
    );

    return { results, stats };
  }

  private recordRejection(
    stats: CollectionStats,
    reason: string,
    originalValue: string,
    source: string,
  ): void {
    stats.rejectedCount++;
    stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] ?? 0) + 1;
    this.logger.debug(
      { originalValue, source, reason },
      'ResultCollector: result rejected',
    );
  }
}
