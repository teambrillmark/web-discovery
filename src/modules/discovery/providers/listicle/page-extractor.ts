// Playwright-based two-phase page fetcher:
//   Phase 1 — SERP: navigate to Yahoo Search, extract result page URLs
//   Phase 2 — Pages: visit each result URL, capture HTML for Cheerio parsing
//
// WHY Yahoo Search instead of Google/Bing/DDG?
// Tested all four in headless Playwright mode:
// - Google: blocks headless Chrome, returns CAPTCHA or empty page
// - DuckDuckGo (lite + html endpoints): returns only 1 logo link in headless mode
// - Bing: returns full HTML but result links go through r.bing.com redirect layer
// - Yahoo: returns 8+ direct external hrefs in headless mode with webdriver override
// Yahoo result links are direct href values (not redirect proxies), making
// Cheerio-style extraction straightforward without needing to follow redirect chains.
//
// WHY one shared browser for all queries?
// Launching a Chromium process takes ~1-2 s. Reusing the same browser across
// all queries keeps the provider's total wall-clock time proportional to the number
// of pages visited, not the number of queries.

import type { BrowserContext } from 'playwright';
import type { Logger } from '../../../../lib/logger';
import type { ListicleSearchEntry, ListiclePage } from './types';

const SERP_TIMEOUT_MS = 18_000;
const PAGE_TIMEOUT_MS = 20_000;
const JS_SETTLE_MS = 2_000;

// Caps per-query to keep runtime reasonable when run alongside other providers
const MAX_SERP_RESULTS = 8;
const MAX_PAGES_TO_VISIT = 4;

const YAHOO_SEARCH_BASE = 'https://search.yahoo.com/search?p=';

// Domains that appear in Yahoo SERP navigation/ads — not result pages
const YAHOO_OWN_DOMAINS = new Set(['yahoo.com', 'yimg.com', 'oath.com', 'verizonmedia.com', 'aol.com']);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Entry point: runs all queries with one shared browser, returns page content.
export async function fetchListiclePages(
  queries: string[],
  logger: Logger,
  queryId: string,
): Promise<ListiclePage[]> {
  if (queries.length === 0) return [];

  const pages: ListiclePage[] = [];
  let browser;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });

    const ctx = await browser.newContext({ userAgent: UA });

    // Override the webdriver flag that headless Chrome sets by default.
    // Yahoo's bot detection checks navigator.webdriver; clearing it lets results through.
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Abort binary assets — we only need text/HTML
    await ctx.route('**/*.{png,jpg,jpeg,gif,webp,woff,woff2,ico,svg,mp4,mp3}', (r) => r.abort());
    await ctx.route('**/*.css', (r) => r.abort());

    for (const query of queries) {
      const entries = await searchYahoo(ctx, query, logger, queryId);

      logger.debug(
        { queryId, provider: 'listicle', query, serpResults: entries.length },
        'SERP entries extracted',
      );

      for (const entry of entries.slice(0, MAX_PAGES_TO_VISIT)) {
        const html = await visitPage(ctx, entry.url, logger, queryId);
        if (html) pages.push({ url: entry.url, html });
      }
    }
  } catch (err) {
    logger.warn({ queryId, provider: 'listicle', err }, 'Listicle page fetcher error');
  } finally {
    await browser?.close();
  }

  return pages;
}

// Navigates to Yahoo Search and returns result page URLs.
// Yahoo result links are direct hrefs to the target site (not Yahoo redirect proxies).
async function searchYahoo(
  ctx: BrowserContext,
  query: string,
  logger: Logger,
  queryId: string,
): Promise<ListicleSearchEntry[]> {
  const page = await ctx.newPage();
  try {
    const searchUrl = `${YAHOO_SEARCH_BASE}${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: SERP_TIMEOUT_MS });
    await page.waitForTimeout(JS_SETTLE_MS);

    // $$eval only accepts one extra serializable argument — wrap into a single object.
    const entries: ListicleSearchEntry[] = await page.$$eval(
      'a[href^="http"]',
      (els, args) => {
        const { max, ownDomains } = args as { max: number; ownDomains: string[] };
        const seen = new Set<string>();
        const results: Array<{ url: string; title: string }> = [];
        for (const el of els) {
          if (results.length >= max) break;
          const href = (el as HTMLAnchorElement).href;
          const title = (el as HTMLAnchorElement).textContent?.trim() ?? '';
          try {
            const parsedUrl = new URL(href);
            const host = parsedUrl.hostname.replace(/^www\./, '');
            const rootHost = host.split('.').slice(-2).join('.');
            if (ownDomains.some((d: string) => rootHost.endsWith(d))) continue;
            // Skip Yahoo Sponsored Results — they carry UTM params like utm_term/utm_campaign
            if (parsedUrl.searchParams.has('utm_term') || parsedUrl.searchParams.has('utm_campaign')) continue;
            if (seen.has(host)) continue;
            seen.add(host);
            results.push({ url: href, title });
          } catch {
            // skip malformed URLs
          }
        }
        return results;
      },
      { max: MAX_SERP_RESULTS, ownDomains: [...YAHOO_OWN_DOMAINS] },
    );

    return entries;
  } catch (err) {
    logger.debug({ queryId, provider: 'listicle', query, err }, 'Yahoo search page failed — skipping query');
    return [];
  } finally {
    await page.close();
  }
}

// Visits a single listicle page and returns its HTML.
// domcontentloaded is enough — we parse static hrefs, not JS-injected content.
async function visitPage(
  ctx: BrowserContext,
  url: string,
  logger: Logger,
  queryId: string,
): Promise<string | null> {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(JS_SETTLE_MS);
    return await page.content();
  } catch (err) {
    logger.debug({ queryId, provider: 'listicle', url, err }, 'Listicle page visit failed — skipping');
    return null;
  } finally {
    await page.close();
  }
}
