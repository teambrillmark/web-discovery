import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextExtractorService } from '../services/context-extractor.service';
import type { CrawlResult, ExtractedContent } from '../types';
import { CrawlerError } from '../types';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const VALID_HTML = `
<html>
<head>
  <title>Acme SaaS - Project Management</title>
  <meta name="description" content="Streamline your team's workflow." />
</head>
<body>
  <nav><a>Home</a><a>Features</a></nav>
  <div class="hero"><h1>Manage Projects Faster</h1></div>
  <section class="services"><h2>Features</h2><p>Task tracking, Kanban, Reporting</p></section>
  <section class="about"><p>Acme SaaS helps teams ship faster.</p></section>
</body>
</html>
`;

const VALID_CRAWL_RESULT: CrawlResult = {
  html: VALID_HTML,
  finalUrl: 'https://acme.com',
  method: 'fetch',
};

const MOCK_AI_CONTEXT: Omit<ExtractedContent, 'crawlMethod' | 'totalChars'> = {
  title: 'Acme SaaS',
  metaDescription: 'Streamline workflow',
  headings: ['Manage Projects Faster'],
  heroText: 'Manage Projects Faster',
  servicesText: 'Task tracking',
  aboutText: 'Acme SaaS helps teams ship faster.',
  navLabels: ['Home', 'Features'],
  bodyText: 'some body text',
};

function makeCrawlerMock(result: CrawlResult) {
  return { fetch: vi.fn().mockResolvedValue(result) };
}

function makeAnalyzerMock() {
  return {
    analyze: vi.fn().mockResolvedValue({
      companyType: 'SaaS',
      industry: 'Project Management',
      niche: 'Team collaboration',
      services: ['Task tracking', 'Kanban'],
      targetAudience: ['Development teams'],
      positioningSummary: 'Project management SaaS for teams.',
      extractedContentSummary: 'Clear homepage with feature descriptions.',
      confidence: 'high',
    }),
  };
}

describe('ContextExtractorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns BusinessContext with all fields for a successful run', async () => {
    const crawler = makeCrawlerMock(VALID_CRAWL_RESULT);
    const analyzer = makeAnalyzerMock();

    const service = new ContextExtractorService(
      crawler as never,
      analyzer as never,
      mockLogger as never,
    );

    const result = await service.run({ domain: 'acme.com', queryId: '550e8400-e29b-41d4-a716-446655440000' });

    expect(result.domain).toBe('acme.com');
    expect(result.queryId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.companyType).toBe('SaaS');
    expect(result.industry).toBe('Project Management');
    expect(result.confidence).toBe('high');
    expect(result.analyzedAt).toBeTruthy();
  });

  it('calls crawler with https:// prefixed URL', async () => {
    const crawler = makeCrawlerMock(VALID_CRAWL_RESULT);
    const analyzer = makeAnalyzerMock();
    const service = new ContextExtractorService(crawler as never, analyzer as never, mockLogger as never);

    await service.run({ domain: 'acme.com', queryId: '550e8400-e29b-41d4-a716-446655440000' });

    expect(crawler.fetch).toHaveBeenCalledWith('https://acme.com');
  });

  it('throws ExtractionError when Cheerio fails and no Playwright configured', async () => {
    const crawler = { fetch: vi.fn().mockRejectedValue(new CrawlerError('Connection refused')) };
    const analyzer = makeAnalyzerMock();
    const service = new ContextExtractorService(crawler as never, analyzer as never, mockLogger as never);

    await expect(
      service.run({ domain: 'unreachable.com', queryId: '550e8400-e29b-41d4-a716-446655440000' }),
    ).rejects.toThrow('Failed to crawl unreachable.com');
  });

  it('falls back to Playwright when Cheerio fails', async () => {
    const cheerioCrawler = { fetch: vi.fn().mockRejectedValue(new CrawlerError('Blocked')) };
    const playwrightCrawler = makeCrawlerMock(VALID_CRAWL_RESULT);
    const analyzer = makeAnalyzerMock();

    const service = new ContextExtractorService(
      cheerioCrawler as never,
      analyzer as never,
      mockLogger as never,
      { playwrightCrawler: playwrightCrawler as never },
    );

    const result = await service.run({ domain: 'acme.com', queryId: '550e8400-e29b-41d4-a716-446655440000' });

    expect(result.domain).toBe('acme.com');
    expect(playwrightCrawler.fetch).toHaveBeenCalled();
  });

  it('passes queryId and domain to analyzer', async () => {
    const crawler = makeCrawlerMock(VALID_CRAWL_RESULT);
    const analyzer = makeAnalyzerMock();
    const service = new ContextExtractorService(crawler as never, analyzer as never, mockLogger as never);

    await service.run({ domain: 'acme.com', queryId: '550e8400-e29b-41d4-a716-446655440000' });

    expect(analyzer.analyze).toHaveBeenCalledWith(
      'acme.com',
      expect.any(Object),
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('includes analyzedAt timestamp in result', async () => {
    const crawler = makeCrawlerMock(VALID_CRAWL_RESULT);
    const analyzer = makeAnalyzerMock();
    const service = new ContextExtractorService(crawler as never, analyzer as never, mockLogger as never);

    const result = await service.run({ domain: 'acme.com', queryId: '550e8400-e29b-41d4-a716-446655440000' });

    expect(new Date(result.analyzedAt).getTime()).toBeGreaterThan(0);
  });
});
