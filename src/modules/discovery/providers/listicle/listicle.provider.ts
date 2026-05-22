// ListicleExtractionProvider — web-discovery via "best X agencies" listicle pages.
//
// Pipeline position: Discovery Layer (parallel with GroqAIProvider + StubSearchProvider)
// Output: ProviderResult[] — same shape as every other provider; nothing listicle-specific leaks out.
//
// Data flow:
//   BusinessContext
//     -> query-builder  (generates search queries from industry/niche/services)
//     -> page-extractor (Playwright: SERP → result URLs → HTML per page)
//     -> domain-extractor (Cheerio: hrefs → candidate domains)
//     -> filters + normalization (isBlockedDomain + normalizeDomain + validateDomain)
//     -> ProviderResult[]
//
// Design invariant: this provider NEVER throws. Any failure returns [].

import type { Logger } from '../../../../lib/logger';
import type { DiscoveryInput, IDiscoveryProvider, ProviderResult } from '../../types';
import { normalizeDomain, validateDomain } from '../../../../shared/domain';
import { buildListicleQueries } from './query-builder';
import { fetchListiclePages } from './page-extractor';
import { extractDomainsFromHtml } from './domain-extractor';

const MAX_RESULTS = 20;

export class ListicleExtractionProvider implements IDiscoveryProvider {
  readonly name = 'listicle-extraction';
  readonly discoveryMethod = 'web-discovery';

  constructor(private readonly logger: Logger) {}

  async discover(input: DiscoveryInput): Promise<ProviderResult[]> {
    const { normalizedDomain, exclusions, queryId, businessContext } = input;

    // Without businessContext we cannot generate industry-specific queries.
    // Return [] rather than generic queries that would surface unrelated domains.
    if (!businessContext) {
      this.logger.debug(
        { queryId, provider: this.name },
        'Listicle provider skipped — no businessContext provided',
      );
      return [];
    }

    // Build exclusion set using the same canonical normalization as the dedup engine.
    // Consistency here prevents the same domain appearing under slightly different forms.
    const excluded = new Set<string>([normalizedDomain]);
    for (const excl of exclusions) {
      const outcome = normalizeDomain(excl);
      if (outcome.ok) excluded.add(outcome.domain);
    }

    const queries = buildListicleQueries(businessContext);
    if (queries.length === 0) {
      this.logger.debug({ queryId, provider: this.name }, 'Listicle provider: no queries generated — returning empty');
      return [];
    }

    this.logger.info(
      { queryId, provider: this.name, queryCount: queries.length, queries },
      'Listicle extraction started',
    );

    // Phase 1 — Playwright: search SERP → fetch listicle page HTML
    const pages = await fetchListiclePages(queries, this.logger, queryId);

    this.logger.debug(
      { queryId, provider: this.name, pagesLoaded: pages.length },
      'Listicle pages fetched',
    );

    // Phase 2 — Cheerio: parse each page's HTML and collect competitor domains
    const seen = new Set<string>();
    const results: ProviderResult[] = [];

    for (const { url, html } of pages) {
      if (results.length >= MAX_RESULTS) break;

      const candidates = extractDomainsFromHtml(html, url);

      this.logger.debug(
        { queryId, provider: this.name, pageUrl: url, candidateCount: candidates.length },
        'Domains extracted from listicle page',
      );

      for (const domain of candidates) {
        if (results.length >= MAX_RESULTS) break;

        if (seen.has(domain)) continue;

        if (excluded.has(domain)) {
          this.logger.debug({ queryId, domain }, 'Listicle: skipping excluded domain');
          continue;
        }

        // Validate format after normalization (normalizeDomain already ran in domain-extractor,
        // but validateDomain adds RFC-compliance checks that go beyond format parsing)
        const valOutcome = validateDomain(domain);
        if (!valOutcome.ok) continue;

        seen.add(domain);
        results.push({ domain, source: this.name, discoveryMethod: this.discoveryMethod });
      }
    }

    this.logger.info(
      {
        queryId,
        provider: this.name,
        pagesVisited: pages.length,
        domainsFound: results.length,
        excludedCount: excluded.size,
      },
      'Listicle extraction complete',
    );

    return results;
  }
}
