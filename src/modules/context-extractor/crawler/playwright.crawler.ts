import type { Logger } from '../../../lib/logger';
import { assertServerContext } from '../../../lib/environment';
import type { ICrawler } from './crawler.interface';
import type { CrawlResult } from '../types';
import { CrawlerError } from '../types';

const NAVIGATION_TIMEOUT_MS = 20_000;
const WAIT_AFTER_LOAD_MS = 1_500;

export class PlaywrightCrawler implements ICrawler {
  constructor(private readonly logger: Logger) {
    assertServerContext('PlaywrightCrawler');
  }

  async fetch(url: string): Promise<CrawlResult> {
    this.logger.debug({ url }, 'PlaywrightCrawler: launching browser');

    let browser;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

      // Block unnecessary resources to speed up loading
      await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,mp4,webm}', (route) =>
        route.abort(),
      );
      await page.route('**/{analytics,tracking,ads}**', (route) => route.abort());

      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });

      if (response && !response.ok()) {
        throw new CrawlerError(`HTTP ${response.status()} for ${url}`);
      }

      await page.waitForTimeout(WAIT_AFTER_LOAD_MS);

      const html = await page.content();
      const finalUrl = page.url();

      this.logger.debug({ url, finalUrl, htmlLength: html.length }, 'PlaywrightCrawler: fetch complete');
      return { html, finalUrl, method: 'playwright' };
    } catch (error) {
      if (error instanceof CrawlerError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new CrawlerError(
        `Playwright failed for ${url}: ${message}`,
        error instanceof Error ? error : undefined,
      );
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }
}
