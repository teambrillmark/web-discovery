import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryEngineService } from '../services/queryEngine.service';
import type { DomainNormalizerService } from '../services/domainNormalizer.service';
import type { ICompetitorRepository } from '../types';
import { InvalidDomainError, QueryEngineError } from '../types';
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

const makeNormalizer = (returnValue?: string): DomainNormalizerService =>
  ({ normalize: vi.fn().mockReturnValue(returnValue ?? 'example.com') }) as unknown as DomainNormalizerService;

const makeRepository = (returnValue?: string[]): ICompetitorRepository => ({
  findAllNormalizedDomains: vi.fn().mockResolvedValue(returnValue ?? []),
});

describe('QueryEngineService', () => {
  let service: QueryEngineService;
  let normalizer: DomainNormalizerService;
  let repository: ICompetitorRepository;
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
    normalizer = makeNormalizer('example.com');
    repository = makeRepository(['competitor1.com', 'competitor2.com']);
    service = new QueryEngineService(normalizer, repository, logger);
  });

  describe('run — happy path', () => {
    it('returns normalizedDomain and exclusions', async () => {
      const result = await service.run({ query: 'https://www.example.com' });

      expect(result.normalizedDomain).toBe('example.com');
      expect(result.exclusions).toEqual(['competitor1.com', 'competitor2.com']);
    });

    it('returns excludedCount matching exclusions length', async () => {
      const result = await service.run({ query: 'example.com' });

      expect(result.excludedCount).toBe(result.exclusions.length);
      expect(result.excludedCount).toBe(2);
    });

    it('returns a valid UUID for queryId', async () => {
      const result = await service.run({ query: 'example.com' });

      expect(result.queryId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('returns a valid ISO timestamp for requestedAt', async () => {
      const before = new Date().toISOString();
      const result = await service.run({ query: 'example.com' });
      const after = new Date().toISOString();

      expect(result.requestedAt >= before).toBe(true);
      expect(result.requestedAt <= after).toBe(true);
    });

    it('returns unique queryId on each call', async () => {
      const [a, b] = await Promise.all([
        service.run({ query: 'example.com' }),
        service.run({ query: 'example.com' }),
      ]);

      expect(a.queryId).not.toBe(b.queryId);
    });

    it('delegates normalization to DomainNormalizerService', async () => {
      await service.run({ query: 'https://example.com' });

      expect(normalizer.normalize).toHaveBeenCalledOnce();
      expect(normalizer.normalize).toHaveBeenCalledWith('https://example.com');
    });

    it('delegates exclusion loading to CompetitorRepository', async () => {
      await service.run({ query: 'example.com' });

      expect(repository.findAllNormalizedDomains).toHaveBeenCalledOnce();
    });

    it('returns empty exclusions and zero excludedCount when no historical competitors exist', async () => {
      repository = makeRepository([]);
      service = new QueryEngineService(normalizer, repository, logger);

      const result = await service.run({ query: 'example.com' });

      expect(result.exclusions).toHaveLength(0);
      expect(result.excludedCount).toBe(0);
    });

    it('handles large exclusion lists without error', async () => {
      const largeList = Array.from({ length: 50_000 }, (_, i) => `competitor${i}.com`);
      repository = makeRepository(largeList);
      service = new QueryEngineService(normalizer, repository, logger);

      const result = await service.run({ query: 'example.com' });

      expect(result.exclusions).toHaveLength(50_000);
      expect(result.excludedCount).toBe(50_000);
    });
  });

  describe('run — failure paths', () => {
    it('propagates InvalidDomainError from normalizer', async () => {
      vi.mocked(normalizer.normalize).mockImplementation(() => {
        throw new InvalidDomainError('Invalid domain');
      });

      await expect(service.run({ query: 'bad-input' })).rejects.toThrow(InvalidDomainError);
    });

    it('propagates QueryEngineError from repository', async () => {
      vi.mocked(repository.findAllNormalizedDomains).mockRejectedValue(
        new QueryEngineError('DB failure'),
      );

      await expect(service.run({ query: 'example.com' })).rejects.toThrow(QueryEngineError);
    });

    it('does not call repository when normalizer throws', async () => {
      vi.mocked(normalizer.normalize).mockImplementation(() => {
        throw new InvalidDomainError('bad');
      });

      await expect(service.run({ query: 'bad' })).rejects.toThrow();
      expect(repository.findAllNormalizedDomains).not.toHaveBeenCalled();
    });
  });

  describe('run — logging', () => {
    it('logs start and completion at info level', async () => {
      await service.run({ query: 'example.com' });

      expect(logger.info).toHaveBeenCalledTimes(2);
    });
  });
});
