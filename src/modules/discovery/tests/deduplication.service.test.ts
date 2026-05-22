import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeduplicationService } from '../services/deduplication.service';
import type { Logger } from '../../../lib/logger';
import type { ProviderResult } from '../types';

const makeLogger = (): Logger =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  }) as unknown as Logger;

const makeResult = (domain: string, source = 'groq'): ProviderResult => ({
  domain,
  source,
  discoveryMethod: 'ai-discovery',
});

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
    service = new DeduplicationService(logger);
  });

  describe('deduplicate', () => {
    it('returns unique domains', () => {
      const results = [makeResult('speero.com'), makeResult('speero.com'), makeResult('cro.media')];
      const output = service.deduplicate(results);
      expect(output).toHaveLength(2);
    });

    it('deduplicates across different sources', () => {
      const results = [
        makeResult('speero.com', 'groq'),
        makeResult('speero.com', 'serpapi'),
      ];
      const output = service.deduplicate(results);
      expect(output).toHaveLength(1);
      expect(output[0]?.source).toBe('groq');
    });

    it('normalizes domains before comparison', () => {
      const results = [
        makeResult('https://www.speero.com/about'),
        makeResult('speero.com'),
      ];
      const output = service.deduplicate(results);
      expect(output).toHaveLength(1);
    });

    it('strips www. and returns clean domain', () => {
      const result = service.deduplicate([makeResult('www.speero.com')]);
      expect(result[0]?.domain).toBe('speero.com');
    });

    it('filters out invalid domain-like strings', () => {
      const results = [makeResult('not-a-domain'), makeResult('speero.com'), makeResult('')];
      const output = service.deduplicate(results);
      expect(output).toHaveLength(1);
      expect(output[0]?.domain).toBe('speero.com');
    });

    it('returns empty array for empty input', () => {
      expect(service.deduplicate([])).toEqual([]);
    });

    it('logs a warning for invalid domains', () => {
      service.deduplicate([makeResult('invalid-no-tld')]);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('handles large inputs without error', () => {
      const large = Array.from({ length: 10_000 }, (_, i) => makeResult(`domain${i}.com`));
      const result = service.deduplicate(large);
      expect(result).toHaveLength(10_000);
    });
  });

  describe('filterExclusions', () => {
    it('removes domains that are in the exclusion list', () => {
      const results = [makeResult('speero.com'), makeResult('convertcart.com'), makeResult('cro.media')];
      const filtered = service.filterExclusions(results, ['convertcart.com']);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((r) => r.domain)).not.toContain('convertcart.com');
    });

    it('normalizes exclusions before comparison', () => {
      const results = [makeResult('speero.com')];
      const filtered = service.filterExclusions(results, ['https://www.speero.com']);
      expect(filtered).toHaveLength(0);
    });

    it('returns all results when exclusions is empty', () => {
      const results = [makeResult('speero.com'), makeResult('cro.media')];
      expect(service.filterExclusions(results, [])).toHaveLength(2);
    });

    it('returns empty array when all results are excluded', () => {
      const results = [makeResult('speero.com')];
      expect(service.filterExclusions(results, ['speero.com'])).toHaveLength(0);
    });
  });
});
