import type { Logger } from '../../../lib/logger';
import { assertServerContext } from '../../../lib/environment';
import type { ICrawler } from '../crawler/crawler.interface';
import type { GroqAnalyzer } from '../ai/groq.analyzer';
import { ContentExtractor } from '../extractors/content.extractor';
import type { ContextExtractorInput, BusinessContext, ExtractedContent } from '../types';
import { CrawlerError, ExtractionError } from '../types';
import { isSparseContent } from '../utils/content.utils';

interface ContextExtractorServiceOptions {
  playwrightCrawler?: ICrawler;
}

export class ContextExtractorService {
  private readonly extractor: ContentExtractor;

  constructor(
    private readonly cheerioCrawler: ICrawler,
    private readonly analyzer: GroqAnalyzer,
    private readonly logger: Logger,
    private readonly options: ContextExtractorServiceOptions = {},
  ) {
    assertServerContext('ContextExtractorService');
    this.extractor = new ContentExtractor();
  }

  async run(input: ContextExtractorInput): Promise<BusinessContext> {
    const { domain, queryId } = input;
    const logCtx = { queryId, domain };
    const url = `https://${domain}`;

    this.logger.info(logCtx, 'ContextExtractor: run started');

    // Step 1: Crawl
    let extracted: ExtractedContent;
    try {
      extracted = await this.crawlWithFallback(url, logCtx);
    } catch (error) {
      throw new ExtractionError(
        `Failed to crawl ${domain}`,
        error instanceof Error ? error : undefined,
      );
    }

    this.logger.info(
      { ...logCtx, totalChars: extracted.totalChars, crawlMethod: extracted.crawlMethod },
      'ContextExtractor: content extracted',
    );

    // Step 2: Analyze
    const aiResult = await this.analyzer.analyze(domain, extracted, queryId);

    const context: BusinessContext = {
      domain,
      queryId,
      analyzedAt: new Date().toISOString(),
      ...aiResult,
    };

    this.logger.info(
      { ...logCtx, confidence: context.confidence, industry: context.industry },
      'ContextExtractor: run complete',
    );

    return context;
  }

  private async crawlWithFallback(
    url: string,
    logCtx: Record<string, unknown>,
  ): Promise<ExtractedContent> {
    // Fast path: fetch + Cheerio
    let crawlResult;
    try {
      crawlResult = await this.cheerioCrawler.fetch(url);
    } catch (error) {
      this.logger.warn({ ...logCtx, error }, 'ContextExtractor: Cheerio fetch failed');

      if (!this.options.playwrightCrawler) {
        throw new CrawlerError(
          `Cheerio fetch failed and no Playwright fallback configured`,
          error instanceof Error ? error : undefined,
        );
      }

      this.logger.info(logCtx, 'ContextExtractor: falling back to Playwright');
      crawlResult = await this.options.playwrightCrawler.fetch(url);
    }

    const extracted = this.extractor.extract(crawlResult.html, crawlResult.method);

    // If content is too sparse and Playwright is available, try the JS-rendered version
    if (isSparseContent(this.buildVisibleText(extracted)) && this.options.playwrightCrawler && crawlResult.method === 'fetch') {
      this.logger.info(
        { ...logCtx, totalChars: extracted.totalChars },
        'ContextExtractor: sparse content — retrying with Playwright',
      );

      try {
        const playwrightResult = await this.options.playwrightCrawler.fetch(url);
        const richer = this.extractor.extract(playwrightResult.html, playwrightResult.method);

        // Only use Playwright result if it has more content
        if (richer.totalChars > extracted.totalChars) {
          return richer;
        }
      } catch (error) {
        this.logger.warn({ ...logCtx, error }, 'ContextExtractor: Playwright fallback failed — using Cheerio result');
      }
    }

    return extracted;
  }

  private buildVisibleText(extracted: ExtractedContent): string {
    return [
      extracted.title,
      extracted.metaDescription,
      extracted.headings.join(' '),
      extracted.heroText,
      extracted.servicesText,
      extracted.aboutText,
    ].join(' ');
  }
}
