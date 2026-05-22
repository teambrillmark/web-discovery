import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryService } from '../services/discovery.service';
import type { DeduplicationService } from '../services/deduplication.service';
import type { ResultCollectorService, NormalizedResult } from '../../result-collector';
import type { DiscoveryInput, IDiscoveryProvider, ProviderResult } from '../types';
import type { Logger } from '../../../lib/logger';

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

const makeProvider = (name: string, results: ProviderResult[]): IDiscoveryProvider => ({
  name,
  discoveryMethod: 'ai-discovery',
  discover: vi.fn().mockResolvedValue(results),
});

const makeFailingProvider = (name: string): IDiscoveryProvider => ({
  name,
  discoveryMethod: 'ai-discovery',
  discover: vi.fn().mockRejectedValue(new Error(`${name} failed`)),
});

const makeDeduplicationService = (): DeduplicationService =>
  ({
    deduplicate: vi.fn(),
    filterExclusions: vi.fn(),
  }) as unknown as DeduplicationService;

const makeResultCollector = (results: NormalizedResult[] = []): ResultCollectorService =>
  ({
    collect: vi.fn().mockReturnValue({
      results,
      stats: {
        inputCount: results.length,
        normalizedCount: results.length,
        rejectedCount: 0,
        duplicatesRemovedCount: 0,
        rejectionReasons: {},
      },
    }),
  }) as unknown as ResultCollectorService;

const validInput: DiscoveryInput = {
  normalizedDomain: 'brillmark.com',
  exclusions: ['convertcart.com'],
  queryId: '550e8400-e29b-41d4-a716-446655440000',
};

const makeNormalized = (
  domain: string,
  source = 'groq',
  method = 'ai-discovery',
): NormalizedResult => ({
  normalizedDomain: domain,
  originalValue: domain,
  source,
  discoveryMethod: method,
  queryId: validInput.queryId,
  discoveredAt: new Date().toISOString(),
});

const sampleResult: ProviderResult = { domain: 'speero.com', source: 'groq', discoveryMethod: 'ai-discovery' };

describe('DiscoveryService', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  describe('run — happy path', () => {
    it('returns discovered competitors with required fields', async () => {
      const rc = makeResultCollector([makeNormalized('speero.com')]);
      const service = new DiscoveryService([makeProvider('groq', [sampleResult])], makeDeduplicationService(), logger, rc);

      const results = await service.run(validInput);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        domain: 'speero.com',
        source: 'groq',
        discoveryMethod: 'ai-discovery',
        queryId: validInput.queryId,
      });
      expect(results[0]?.discoveredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('runs all providers in parallel and merges results', async () => {
      const r1: ProviderResult = { domain: 'speero.com', source: 'groq', discoveryMethod: 'ai-discovery' };
      const r2: ProviderResult = { domain: 'cro.media', source: 'serpapi', discoveryMethod: 'web-search' };
      const rc = makeResultCollector([makeNormalized('speero.com'), makeNormalized('cro.media', 'serpapi', 'web-search')]);

      const p1 = makeProvider('groq', [r1]);
      const p2 = makeProvider('serpapi', [r2]);
      const service = new DiscoveryService([p1, p2], makeDeduplicationService(), logger, rc);

      await service.run(validInput);

      expect(p1.discover).toHaveBeenCalledOnce();
      expect(p2.discover).toHaveBeenCalledOnce();
      expect(rc.collect).toHaveBeenCalledWith(expect.arrayContaining([r1, r2]), validInput.queryId);
    });

    it('passes all collected results through without exclusion filtering', async () => {
      // Exclusions are forwarded to providers (AI prompt) to encourage new discoveries,
      // but DiscoveryService does NOT filter them from the collected results.
      // The dedup engine is responsible for classifying new vs existing so that
      // re-discovered known competitors produce existingCount > 0.
      const rc = makeResultCollector([
        makeNormalized('speero.com'),
        makeNormalized('convertcart.com'), // in validInput.exclusions — must still pass through
      ]);
      const service = new DiscoveryService([makeProvider('groq', [sampleResult])], makeDeduplicationService(), logger, rc);

      const results = await service.run(validInput);

      expect(results.map((r) => r.domain)).toContain('speero.com');
      expect(results.map((r) => r.domain)).toContain('convertcart.com');
    });

    it('stamps each result with queryId and discoveredAt', async () => {
      const rc = makeResultCollector([makeNormalized('speero.com')]);
      const service = new DiscoveryService([makeProvider('groq', [sampleResult])], makeDeduplicationService(), logger, rc);

      const results = await service.run(validInput);

      expect(results[0]?.queryId).toBe(validInput.queryId);
      expect(typeof results[0]?.discoveredAt).toBe('string');
    });
  });

  describe('run — resilience', () => {
    it('continues and returns results when one provider fails', async () => {
      const rc = makeResultCollector([makeNormalized('speero.com')]);
      const service = new DiscoveryService(
        [makeFailingProvider('serpapi'), makeProvider('groq', [sampleResult])],
        makeDeduplicationService(),
        logger,
        rc,
      );

      const results = await service.run(validInput);

      expect(results).toHaveLength(1);
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns empty array when all providers fail', async () => {
      const rc = makeResultCollector([]);
      const service = new DiscoveryService(
        [makeFailingProvider('groq'), makeFailingProvider('serpapi')],
        makeDeduplicationService(),
        logger,
        rc,
      );

      const results = await service.run(validInput);
      expect(results).toHaveLength(0);
    });

    it('returns empty array and logs warning when no providers are configured', async () => {
      const service = new DiscoveryService([], makeDeduplicationService(), logger, makeResultCollector());

      const results = await service.run(validInput);

      expect(results).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('run — logging', () => {
    it('logs start, result-collection, and completion at info level', async () => {
      const rc = makeResultCollector([]);
      const service = new DiscoveryService([makeProvider('groq', [])], makeDeduplicationService(), logger, rc);

      await service.run(validInput);

      expect(logger.info).toHaveBeenCalledTimes(3);
    });
  });
});
