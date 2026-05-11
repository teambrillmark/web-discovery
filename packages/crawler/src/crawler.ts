import { chromium, Browser, BrowserContext } from 'playwright';
import { CrawlerOptions, PageData } from './types';
import { PageAnalyzer } from './page-analyzer';
import { CRAWL_SETTINGS } from '@discovery/shared';

export class Crawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: Required<CrawlerOptions>;
  private analyzer: PageAnalyzer;

  constructor(options: CrawlerOptions = {}) {
    this.options = {
      headless: options.headless ?? CRAWL_SETTINGS.HEADLESS,
      timeout: options.timeout ?? CRAWL_SETTINGS.REQUEST_TIMEOUT,
      maxRetries: options.maxRetries ?? CRAWL_SETTINGS.MAX_RETRIES,
      retryDelay: options.retryDelay ?? CRAWL_SETTINGS.RETRY_DELAY,
      userAgent: options.userAgent ?? CRAWL_SETTINGS.USER_AGENT,
      waitForSelector: options.waitForSelector ?? 'body',
    };
    this.analyzer = new PageAnalyzer();
  }

  async init(): Promise<void> {
    console.log('[Crawler] Initializing browser...');
    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    this.context = await this.browser.newContext({
      userAgent: this.options.userAgent,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    // Block unnecessary resources to speed up crawling
    await this.context.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot,mp4,mp3,avi}', route => route.abort());
    console.log('[Crawler] Browser initialized');
  }

  async crawlPage(url: string): Promise<PageData> {
    if (!this.context) await this.init();

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      const page = await this.context!.newPage();
      try {
        console.log(`[Crawler] Crawling ${url} (attempt ${attempt}/${this.options.maxRetries})`);

        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.options.timeout,
        });

        await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});

        const html = await page.content();
        const statusCode = response?.status();
        const duration = Date.now() - startTime;

        const pageData = await this.analyzer.analyze(page, html, url, duration, statusCode);
        await page.close();
        return pageData;

      } catch (error) {
        lastError = error as Error;
        console.warn(`[Crawler] Attempt ${attempt} failed for ${url}: ${lastError.message}`);
        await page.close().catch(() => {});

        if (attempt < this.options.maxRetries) {
          await this.sleep(this.options.retryDelay * attempt);
        }
      }
    }

    return {
      url,
      domain: this.extractDomain(url),
      html: '',
      title: null,
      description: null,
      keywords: null,
      ogTitle: null,
      ogDescription: null,
      canonicalUrl: null,
      headings: [],
      links: [],
      internalLinks: [],
      externalLinks: [],
      socialLinks: {},
      emails: [],
      phones: [],
      technologies: [],
      bodyText: '',
      schemaOrg: null,
      success: false,
      error: lastError?.message ?? 'Unknown error',
      duration: Date.now() - startTime,
    };
  }

  async crawlMultiple(urls: string[], concurrency = 3): Promise<PageData[]> {
    const results: PageData[] = [];
    const queue = [...urls];

    while (queue.length > 0) {
      const batch = queue.splice(0, concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(url => this.crawlPage(url))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('[Crawler] Batch crawl error:', result.reason);
        }
      }
    }

    return results;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('[Crawler] Browser closed');
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
