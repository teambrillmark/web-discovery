import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ResultCollectorService } from '../services/result-collector.service';
import type { Logger } from '../../../lib/logger';
import type { RawProviderResult } from '../types';

const makeLogger = (): Logger =>
  ({
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  }) as unknown as Logger;

const raw = (domain: string, source = 'groq', method = 'ai-discovery'): RawProviderResult => ({
  domain,
  source,
  discoveryMethod: method,
});

const QUERY_ID = '00000000-0000-0000-0000-000000000001';

describe('ResultCollectorService', () => {
  let service: ResultCollectorService;

  beforeEach(() => {
    service = new ResultCollectorService(makeLogger());
  });

  // ── Empty input ─────────────────────────────────────────────────────────────

  it('returns empty results for empty input', () => {
    const { results, stats } = service.collect([], QUERY_ID);
    expect(results).toHaveLength(0);
    expect(stats.inputCount).toBe(0);
    expect(stats.normalizedCount).toBe(0);
  });

  // ── Normalization ───────────────────────────────────────────────────────────

  it('normalizes a full URL to root domain', () => {
    const { results } = service.collect([raw('https://www.speero.com/about?x=1')], QUERY_ID);
    expect(results).toHaveLength(1);
    expect(results[0]?.normalizedDomain).toBe('speero.com');
  });

  it('preserves the original raw value', () => {
    const input = 'https://www.speero.com/about';
    const { results } = service.collect([raw(input)], QUERY_ID);
    expect(results[0]?.originalValue).toBe(input);
  });

  it('normalizes http and https equally', () => {
    const { results } = service.collect([
      raw('http://convertcart.com'),
      raw('https://convertcart.com'),
    ], QUERY_ID);
    expect(results).toHaveLength(1);
    expect(results[0]?.normalizedDomain).toBe('convertcart.com');
  });

  it('strips www prefix', () => {
    const { results } = service.collect([raw('www.vwo.com')], QUERY_ID);
    expect(results[0]?.normalizedDomain).toBe('vwo.com');
  });

  it('strips URL query params and fragments', () => {
    const { results } = service.collect([raw('https://abtasty.com/page?ref=google#section')], QUERY_ID);
    expect(results[0]?.normalizedDomain).toBe('abtasty.com');
  });

  it('lowercases all domains', () => {
    const { results } = service.collect([raw('OPTIMIZELY.COM')], QUERY_ID);
    expect(results[0]?.normalizedDomain).toBe('optimizely.com');
  });

  // ── Metadata stamping ───────────────────────────────────────────────────────

  it('stamps queryId on every result', () => {
    const { results } = service.collect([raw('speero.com')], QUERY_ID);
    expect(results[0]?.queryId).toBe(QUERY_ID);
  });

  it('stamps discoveredAt as an ISO timestamp on every result', () => {
    const { results } = service.collect([raw('speero.com')], QUERY_ID);
    expect(() => new Date(results[0]!.discoveredAt)).not.toThrow();
    expect(new Date(results[0]!.discoveredAt).toISOString()).toBe(results[0]?.discoveredAt);
  });

  it('all results in a batch share the same discoveredAt', () => {
    const { results } = service.collect([raw('speero.com'), raw('vwo.com')], QUERY_ID);
    expect(results[0]?.discoveredAt).toBe(results[1]?.discoveredAt);
  });

  it('preserves source and discoveryMethod', () => {
    const { results } = service.collect([raw('speero.com', 'stub-search', 'web-search')], QUERY_ID);
    expect(results[0]?.source).toBe('stub-search');
    expect(results[0]?.discoveryMethod).toBe('web-search');
  });

  // ── In-batch deduplication ──────────────────────────────────────────────────

  it('removes exact duplicates within a batch', () => {
    const { results, stats } = service.collect([
      raw('speero.com'),
      raw('speero.com'),
    ], QUERY_ID);
    expect(results).toHaveLength(1);
    expect(stats.duplicatesRemovedCount).toBe(1);
  });

  it('deduplicates across different URL forms of the same domain', () => {
    const { results } = service.collect([
      raw('https://www.speero.com/about'),
      raw('speero.com'),
      raw('http://speero.com/'),
    ], QUERY_ID);
    expect(results).toHaveLength(1);
  });

  it('deduplicates across different sources', () => {
    const { results } = service.collect([
      raw('vwo.com', 'groq'),
      raw('https://vwo.com/', 'stub-search'),
    ], QUERY_ID);
    expect(results).toHaveLength(1);
    // First encountered source wins
    expect(results[0]?.source).toBe('groq');
  });

  // ── Validation / rejection ──────────────────────────────────────────────────

  it('rejects empty domain strings', () => {
    const { results, stats } = service.collect([raw('')], QUERY_ID);
    expect(results).toHaveLength(0);
    expect(stats.rejectedCount).toBe(1);
  });

  it('rejects localhost', () => {
    const { results, stats } = service.collect([raw('localhost')], QUERY_ID);
    expect(results).toHaveLength(0);
    expect(stats.rejectedCount).toBe(1);
  });

  it('rejects IPv4 addresses', () => {
    const { results } = service.collect([raw('192.168.1.1')], QUERY_ID);
    expect(results).toHaveLength(0);
  });

  it('rejects bare labels with no TLD', () => {
    const { results } = service.collect([raw('notadomain')], QUERY_ID);
    expect(results).toHaveLength(0);
  });

  it('filters invalid results while keeping valid ones in mixed input', () => {
    const { results, stats } = service.collect([
      raw('https://www.speero.com/about?x=1'),
      raw(''),
      raw('localhost'),
      raw('not-a-domain'),
      raw('192.168.0.1'),
      raw('vwo.com'),
      raw('convertcart.com'),
    ], QUERY_ID);

    expect(results.map((r) => r.normalizedDomain)).toEqual(['speero.com', 'vwo.com', 'convertcart.com']);
    expect(stats.inputCount).toBe(7);
    expect(stats.normalizedCount).toBe(3);
    expect(stats.rejectedCount).toBe(4);
  });

  // ── Stats ───────────────────────────────────────────────────────────────────

  it('counts rejection reasons by category', () => {
    const { stats } = service.collect([
      raw(''),
      raw(''),
      raw('localhost'),
    ], QUERY_ID);

    expect(stats.rejectedCount).toBe(3);
    expect(Object.keys(stats.rejectionReasons).length).toBeGreaterThan(0);
  });

  it('correctly sums inputCount = normalizedCount + rejectedCount + duplicatesRemovedCount', () => {
    const { stats } = service.collect([
      raw('speero.com'),
      raw('speero.com'),
      raw(''),
      raw('vwo.com'),
    ], QUERY_ID);

    expect(stats.inputCount).toBe(stats.normalizedCount + stats.rejectedCount + stats.duplicatesRemovedCount);
  });

  // ── Scale ───────────────────────────────────────────────────────────────────

  it('handles a large batch without error', () => {
    const large = Array.from({ length: 5_000 }, (_, i) => raw(`domain${i}.com`));
    const { results, stats } = service.collect(large, QUERY_ID);
    expect(results).toHaveLength(5_000);
    expect(stats.normalizedCount).toBe(5_000);
  });
});
