import type { Logger } from '../../../../lib/logger';
import type { DiscoveryInput, IDiscoveryProvider, ProviderResult } from '../../types';
import { normalizeDomain, isDomainLike } from '../../utils/domainUtils';

const PAGE_TIMEOUT_MS = 20_000;
const JS_SETTLE_MS = 3_000;
const MAX_RESULTS = 10;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// AlternativeTo slugs sometimes omit the dot in a TLD (e.g. 'wixcom' -> 'wix.com').
function slugToDomain(slug: string): string {
  for (const tld of ['com', 'net', 'io', 'org']) {
    if (slug.endsWith(tld) && slug.length > tld.length + 2) {
      return `${slug.slice(0, -tld.length)}.${tld}`;
    }
  }
  return `${slug}.com`;
}

export class StubSearchProvider implements IDiscoveryProvider {
  readonly name = 'stub-search';
  readonly discoveryMethod = 'web-search';

  constructor(private readonly logger: Logger) {}

  async discover(input: DiscoveryInput): Promise<ProviderResult[]> {
    const { normalizedDomain, exclusions, queryId } = input;
    const excluded = new Set<string>([normalizedDomain]);
    for (const excl of exclusions) {
      const outcome = normalizeDomain(excl);
      if (outcome.ok) excluded.add(outcome.domain);
    }

    // Derive the AlternativeTo product slug from the input domain ('shopify.com' -> 'shopify').
    const slug = normalizedDomain.split('.')[0];
    if (!slug || slug.length < 2) return [];

    let browser;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({ userAgent: UA });
      const page = await ctx.newPage();
      await page.route('**/*.{png,jpg,gif,webp,woff,woff2,ico,css}', (r) => r.abort());

      await page.goto(`https://alternativeto.net/software/${slug}/`, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      // Give React/hydration a moment to render the alternatives list.
      await page.waitForTimeout(JS_SETTLE_MS);

      // Collect unique competitor slugs from /software/<slug>/ links.
      // Skip the input slug and sponsored "Official Partner" banner items.
      const competitorSlugs: string[] = await page.$$eval(
        'a[href^="/software/"]',
        (els, mainSlug) => {
          const seen = new Set<string>();
          for (const el of els) {
            const text = (el as HTMLAnchorElement).textContent?.trim() ?? '';
            if (text === 'Official Partner') continue;
            const m = (el as HTMLAnchorElement).getAttribute('href')?.match(/^\/software\/([^/]+)\//);
            if (m && m[1] !== mainSlug) seen.add(m[1]);
          }
          return [...seen];
        },
        slug,
      );

      this.logger.debug(
        { queryId, provider: this.name, slug, slugsFound: competitorSlugs.length, excludedCount: excluded.size },
        competitorSlugs.length === 0
          ? 'AlternativeTo: no software entries found — domain may not be listed (works best for SaaS products)'
          : 'AlternativeTo: slugs scraped, applying exclusion filter',
      );

      // Resolve each competitor slug to a domain and validate.
      const seen = new Set<string>();
      const results: ProviderResult[] = [];

      for (const competitorSlug of competitorSlugs) {
        if (results.length >= MAX_RESULTS) break;
        const domain = slugToDomain(competitorSlug);
        if (!isDomainLike(domain)) continue;
        if (excluded.has(domain)) {
          this.logger.debug({ queryId, domain }, 'AlternativeTo: skipping excluded domain');
          continue;
        }
        if (seen.has(domain)) continue;
        seen.add(domain);
        results.push({ domain, source: this.name, discoveryMethod: this.discoveryMethod });
      }

      this.logger.info(
        { queryId, provider: this.name, slugsFound: competitorSlugs.length, excluded: excluded.size, found: results.length },
        'Web search discovery complete',
      );
      return results;
    } catch (err) {
      this.logger.warn({ queryId, provider: this.name, err }, 'Web search discovery failed — returning empty');
      return [];
    } finally {
      await browser?.close();
    }
  }
}
