import type { Logger } from '../../../lib/logger';
import { assertServerContext } from '../../../lib/environment';
import type { ICrawler } from './crawler.interface';
import type { CrawlResult } from '../types';
import { CrawlerError } from '../types';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export class CheerioCrawler implements ICrawler {
  constructor(private readonly logger: Logger) {
    assertServerContext('CheerioCrawler');
  }

  async fetch(url: string): Promise<CrawlResult> {
    this.logger.debug({ url }, 'CheerioCrawler: fetching');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; CompetitorAnalysisBot/1.0; +https://example.com/bot)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new CrawlerError(
          `HTTP ${response.status} for ${url}`,
        );
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new CrawlerError(`Response too large (${contentLength} bytes) for ${url}`);
      }

      const html = await response.text();
      const finalUrl = response.url;

      this.logger.debug({ url, finalUrl, htmlLength: html.length }, 'CheerioCrawler: fetch complete');
      return { html, finalUrl, method: 'fetch' };
    } catch (error) {
      if (error instanceof CrawlerError) throw error;

      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = message.includes('abort') || message.includes('timeout');
      throw new CrawlerError(
        isTimeout ? `Fetch timed out after ${FETCH_TIMEOUT_MS}ms for ${url}` : `Fetch failed for ${url}: ${message}`,
        error instanceof Error ? error : undefined,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
