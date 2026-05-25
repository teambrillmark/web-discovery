// Persists rejected candidates to the rejected_candidates table.
//
// WHY persist rejections?
//   Rejected results are intelligence. Knowing meetup.com is not a competitor
//   of this company means future discovery runs can skip it without re-running
//   qualification. It also enables provider-quality analysis: which provider
//   generates the most noise for which company type?

import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../../lib/logger';
import type { RejectedCandidateRecord } from '../types';

export interface IRejectedCandidateRepository {
  saveMany(records: RejectedCandidateRecord[]): Promise<void>;
  existsForQueryId(domain: string, queryId: string): Promise<boolean>;
}

export class RejectedCandidateRepository implements IRejectedCandidateRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async saveMany(records: RejectedCandidateRecord[]): Promise<void> {
    if (records.length === 0) return;

    try {
      await this.prisma.rejectedCandidate.createMany({
        data: records.map((r) => ({
          domain:          r.domain,
          queryId:         r.queryId,
          rejectionReason: r.rejectionReason,
          rejectionStage:  r.rejectionStage,
          classification:  r.classification,
          relevance:       r.relevance ?? null,
          confidence:      r.confidence,
          provider:        r.provider ?? null,
          rejectedAt:      new Date(r.rejectedAt),
        })),
        skipDuplicates: true,
      });

      this.logger.debug(
        { count: records.length },
        'RejectedCandidateRepository: saved rejected candidates',
      );
    } catch (err) {
      // Persistence failures are non-fatal — don't break the discovery run.
      this.logger.error({ error: err, count: records.length }, 'RejectedCandidateRepository: save failed');
    }
  }

  async existsForQueryId(domain: string, queryId: string): Promise<boolean> {
    const count = await this.prisma.rejectedCandidate.count({
      where: { domain, queryId },
    });
    return count > 0;
  }
}
