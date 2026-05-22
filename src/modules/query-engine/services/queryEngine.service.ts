import { randomUUID } from 'crypto';
import type { Logger } from '../../../lib/logger';
import type { DomainNormalizerService } from './domainNormalizer.service';
import type { ICompetitorRepository, QueryEngineInput, QueryEngineOutput } from '../types';

export class QueryEngineService {
  constructor(
    private readonly normalizer: DomainNormalizerService,
    private readonly competitorRepository: ICompetitorRepository,
    private readonly logger: Logger,
  ) {}

  async run(input: QueryEngineInput): Promise<QueryEngineOutput> {
    const queryId = randomUUID();
    const requestedAt = new Date().toISOString();

    this.logger.info({ query: input.query, queryId }, 'QueryEngine run started');

    const normalizedDomain = this.normalizer.normalize(input.query);
    const exclusions = await this.competitorRepository.findAllNormalizedDomains();
    const excludedCount = exclusions.length;

    this.logger.info(
      { queryId, normalizedDomain, excludedCount },
      'QueryEngine run completed',
    );

    return { normalizedDomain, exclusions, excludedCount, queryId, requestedAt };
  }
}
