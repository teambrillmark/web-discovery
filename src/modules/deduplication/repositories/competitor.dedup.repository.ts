import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../../lib/logger';
import { assertServerContext } from '../../../lib/environment';
import type { CompetitorRecord } from '../types';

export interface ICompetitorDedupRepository {
  findByDomains(domains: string[]): Promise<CompetitorRecord[]>;
}

export class CompetitorDedupRepository implements ICompetitorDedupRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {
    assertServerContext('CompetitorDedupRepository');
  }

  async findByDomains(domains: string[]): Promise<CompetitorRecord[]> {
    if (domains.length === 0) return [];

    this.logger.debug({ count: domains.length }, 'Batch-looking up competitors by domain');

    const records = await this.prisma.competitor.findMany({
      where: { normalizedDomain: { in: domains } },
      select: { id: true, normalizedDomain: true },
    });

    this.logger.debug({ found: records.length, queried: domains.length }, 'Competitor lookup complete');
    return records;
  }
}
