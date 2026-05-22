import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroqAnalyzer } from '../ai/groq.analyzer';
import type { ExtractedContent } from '../types';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const SAMPLE_EXTRACTED: ExtractedContent = {
  title: 'BrillMark - CRO Agency',
  metaDescription: 'Shopify CRO experts',
  headings: ['Boost Conversions', 'Our Services'],
  heroText: 'We help Shopify brands convert more visitors.',
  servicesText: 'A/B Testing, CRO Audits, Shopify Development',
  aboutText: 'BrillMark is a data-driven agency.',
  navLabels: ['Home', 'Services', 'About'],
  bodyText: 'eCommerce brands trust us for CRO.',
  crawlMethod: 'fetch',
  totalChars: 300,
};

function makeGroqMock(responseContent: string) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: responseContent } }],
        }),
      },
    },
  };
}

describe('GroqAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GROQ_MODEL', 'llama-3.3-70b-versatile');
  });

  it('returns parsed business context for valid AI response', async () => {
    const validResponse = JSON.stringify({
      companyType: 'Agency',
      industry: 'eCommerce CRO',
      niche: 'Shopify conversion optimization',
      services: ['CRO Audits', 'A/B Testing', 'Shopify Development'],
      targetAudience: ['eCommerce brands', 'Shopify merchants'],
      positioningSummary: 'Data-driven CRO agency for Shopify.',
      extractedContentSummary: 'Rich homepage content with clear service descriptions.',
      confidence: 'high',
    });

    const groq = makeGroqMock(validResponse) as never;
    const analyzer = new GroqAnalyzer(groq, mockLogger as never, { maxRetries: 1, retryDelayMs: 0 });

    const result = await analyzer.analyze('brillmark.com', SAMPLE_EXTRACTED, 'test-uuid');

    expect(result.companyType).toBe('Agency');
    expect(result.industry).toBe('eCommerce CRO');
    expect(result.services).toContain('CRO Audits');
    expect(result.confidence).toBe('high');
  });

  it('returns low-confidence fallback when Groq returns malformed JSON', async () => {
    const groq = makeGroqMock('not valid json {{{{') as never;
    const analyzer = new GroqAnalyzer(groq, mockLogger as never, { maxRetries: 1, retryDelayMs: 0 });

    const result = await analyzer.analyze('example.com', SAMPLE_EXTRACTED, 'test-uuid');

    expect(result.confidence).toBe('low');
    expect(result.companyType).toBe('Unknown');
    expect(result.services).toHaveLength(0);
  });

  it('returns low-confidence fallback when schema validation fails', async () => {
    const invalidSchema = JSON.stringify({
      companyType: 123,
      industry: null,
      confidence: 'super-high',
    });
    const groq = makeGroqMock(invalidSchema) as never;
    const analyzer = new GroqAnalyzer(groq, mockLogger as never, { maxRetries: 1, retryDelayMs: 0 });

    const result = await analyzer.analyze('example.com', SAMPLE_EXTRACTED, 'test-uuid');

    expect(result.confidence).toBe('low');
  });

  it('returns low-confidence fallback when Groq returns empty content', async () => {
    const groq = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '' } }],
          }),
        },
      },
    } as never;
    const analyzer = new GroqAnalyzer(groq, mockLogger as never, { maxRetries: 1, retryDelayMs: 0 });

    await expect(analyzer.analyze('example.com', SAMPLE_EXTRACTED, 'test-uuid')).rejects.toThrow();
  });

  it('applies defaults for missing optional fields', async () => {
    const minimalResponse = JSON.stringify({
      companyType: 'SaaS',
      industry: 'FinTech',
      niche: 'Payment processing',
      confidence: 'medium',
    });
    const groq = makeGroqMock(minimalResponse) as never;
    const analyzer = new GroqAnalyzer(groq, mockLogger as never, { maxRetries: 1, retryDelayMs: 0 });

    const result = await analyzer.analyze('example.com', SAMPLE_EXTRACTED, 'test-uuid');

    expect(result.services).toEqual([]);
    expect(result.targetAudience).toEqual([]);
    expect(result.positioningSummary).toBe('');
  });

  it('throws ContextAnalysisError when all retries are exhausted', async () => {
    const groq = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('API unavailable')),
        },
      },
    } as never;
    const analyzer = new GroqAnalyzer(groq, mockLogger as never, { maxRetries: 2, retryDelayMs: 0 });

    await expect(analyzer.analyze('example.com', SAMPLE_EXTRACTED, 'test-uuid')).rejects.toThrow(
      'Groq analysis failed after all retries',
    );
  });
});
