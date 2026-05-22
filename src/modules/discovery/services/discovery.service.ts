import type { Logger } from '../../../lib/logger';
import type { DeduplicationService } from './deduplication.service';
import type { ResultCollectorService } from '../../result-collector';
import type { DiscoveredCompetitor, DiscoveryInput, IDiscoveryProvider } from '../types';

export class DiscoveryService {
  constructor(
    private readonly providers: IDiscoveryProvider[],
    private readonly deduplicationService: DeduplicationService,
    private readonly logger: Logger,
    private readonly resultCollector: ResultCollectorService,
  ) {}

  async run(input: DiscoveryInput): Promise<DiscoveredCompetitor[]> {
    const logCtx = {
      queryId: input.queryId,
      domain: input.normalizedDomain,
      providerCount: this.providers.length,
    };

    this.logger.info(logCtx, 'Discovery run started');

    if (this.providers.length === 0) {
      this.logger.warn(logCtx, 'No discovery providers configured — returning empty');
      return [];
    }

    // Run all providers in parallel. Providers must handle their own errors and return [].
    const settled = await Promise.allSettled(
      this.providers.map((provider) =>
        provider.discover(input).then((results) => ({ providerName: provider.name, results })),
      ),
    );

    const rawResults = settled.flatMap((outcome) => {
      if (outcome.status === 'fulfilled') {
        this.logger.debug(
          { queryId: input.queryId, provider: outcome.value.providerName, count: outcome.value.results.length },
          'Provider results collected',
        );
        return outcome.value.results;
      }
      this.logger.error(
        { queryId: input.queryId, error: outcome.reason },
        'Provider threw unexpectedly — skipping its results',
      );
      return [];
    });

    // Normalize, validate, and deduplicate raw provider output.
    // Exclusions are passed to providers (AI prompt) to encourage new discoveries,
    // but collected results are NOT filtered here — all discovered domains (including
    // re-discovered known ones) pass to the dedup engine so it can correctly classify
    // them as new vs existing and record every discovery event for historical intelligence.
    const { results: collected, stats } = this.resultCollector.collect(rawResults, input.queryId);

    this.logger.info(
      {
        queryId: input.queryId,
        rawCount: rawResults.length,
        afterCollect: collected.length,
        rejected: stats.rejectedCount,
        duplicatesRemoved: stats.duplicatesRemovedCount,
        rejectionReasons: stats.rejectionReasons,
      },
      'ResultCollector stage complete',
    );

    const competitors: DiscoveredCompetitor[] = collected.map((r) => ({
      domain: r.normalizedDomain,
      source: r.source,
      discoveryMethod: r.discoveryMethod,
      discoveredAt: r.discoveredAt,
      queryId: r.queryId,
    }));

    this.logger.info(
      {
        queryId: input.queryId,
        totalFromProviders: rawResults.length,
        afterCollect: collected.length,
        finalCount: competitors.length,
      },
      'Discovery run completed',
    );

    return competitors;
  }
}
