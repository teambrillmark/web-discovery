import { Prisma, type PrismaClient } from '@prisma/client';
import type { Logger } from '../../../lib/logger';
import { assertServerContext } from '../../../lib/environment';
import type { ICompetitorRepository } from '../types';

export class CompetitorRepository implements ICompetitorRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {
    assertServerContext('CompetitorRepository');
  }

  async findAllNormalizedDomains(): Promise<string[]> {
    this.logger.debug('Loading all known competitor domains for exclusion list');

    try {
      const results = await this.prisma.competitor.findMany({
        select: { normalizedDomain: true },
        distinct: ['normalizedDomain'],
      });

      const domains = results.map((r) => r.normalizedDomain);
      this.logger.debug({ count: domains.length }, 'Competitor domains loaded');
      return domains;
    } catch (error) {
      // DB unreachable at startup or connection lost — degrade gracefully so the
      // pipeline still runs with no exclusions rather than returning a 500.
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientKnownRequestError
      ) {
        this.logger.warn({ error }, 'Database unavailable — returning empty exclusion list');
        return [];
      }
      this.logger.error({ error }, 'Failed to load competitor domains from database');
      throw error;
    }
  }
}
