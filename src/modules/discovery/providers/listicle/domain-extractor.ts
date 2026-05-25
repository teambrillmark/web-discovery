// Extracts external competitor domain candidates from a listicle page's HTML.
//
// WHY Cheerio instead of Playwright's $eval here?
// We already have the full HTML string from page-extractor. Cheerio can parse it
// synchronously in-process without a browser context — faster and no async overhead.
// Playwright stays in page-extractor where its browser-rendering ability is actually needed.
//
// Extraction strategy:
//   1. Scope to article body (article, main, .post-content, etc.) when present.
//      Listicle pages put competitor links in the editorial body, not in nav/footer/sidebars,
//      so scoping eliminates most ad-network and widget noise without additional filters.
//   2. Follow every <a href> pointing to a different host than the page itself.
//   3. Apply blocklist + canonical normalization as final gates.

import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { normalizeDomain } from '../../../../shared/domain';
import { isBlockedDomain } from './filters';

const MAX_DOMAINS_PER_PAGE = 30;

// Selectors that identify the editorial body of a page.
// Tried in order — first match wins. Falls back to the whole document if none match.
const CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.content-body',
  '.blog-content',
  '.page-content',
];

export function extractDomainsFromHtml(html: string, sourceUrl: string): string[] {
  let sourceHost = '';
  try {
    sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    // Malformed sourceUrl — proceed without self-link filtering
  }

  const $ = cheerio.load(html);

  // Scope to article body when available to avoid ad/footer/nav link noise.
  let $scope: Cheerio<AnyNode> | ReturnType<typeof $> = $.root();
  for (const sel of CONTENT_SELECTORS) {
    const found = $(sel).first();
    if (found.length) {
      $scope = found;
      break;
    }
  }

  const seen = new Set<string>();
  const domains: string[] = [];

  $scope.find('a[href]').each((_, el) => {
    if (domains.length >= MAX_DOMAINS_PER_PAGE) return false;

    const href = $(el).attr('href') ?? '';

    // Reject relative, mailto:, tel:, anchor, and javascript: links
    if (!href.startsWith('http://') && !href.startsWith('https://')) return;

    let hostname: string;
    try {
      hostname = new URL(href).hostname;
    } catch {
      return;
    }

    const domain = hostname.replace(/^www\./, '');

    // Self-links and empty hostnames carry no competitor signal
    if (!domain || domain === sourceHost) return;

    // Deduplicate before any further checks
    if (seen.has(domain)) return;

    // Filter social/CDN/analytics/ad noise
    if (isBlockedDomain(domain)) return;

    // Final gate: canonical normalization must succeed (validates public domain format)
    const outcome = normalizeDomain(`https://${domain}`);
    if (!outcome.ok) return;

    seen.add(outcome.domain);
    domains.push(outcome.domain);
    return;
  });

  return domains;
}
