import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeduplicationEngineService } from '../services/deduplication-engine.service';
import type { ICompetitorDedupRepository } from '../repositories/competitor.dedup.repository';
import type { CompetitorRecord, DeduplicationInput } from '../types';
import type { Logger } from '../../../lib/logger';
import type { PrismaClient } from '@prisma/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUERY_ID = '550e8400-e29b-41d4-a716-446655440001';

const makeLogger = (): Logger =>
  ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    fatal: vi.fn(), trace: vi.fn(), child: vi.fn(),
  }) as unknown as Logger;

const makeInput = (domain: string, source = 'groq'): DeduplicationInput => ({
  normalizedDomain: domain,
  originalValue: `https://www.${domain}`,
  source,
  discoveryMethod: 'ai-discovery',
  queryId: QUERY_ID,
  discoveredAt: new Date().toISOString(),
});

const makeCompetitorRecord = (domain: string, id = `id-${domain}`): CompetitorRecord => ({
  id, normalizedDomain: domain,
});

const makeTx = () => ({
  competitor: {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([]),
  },
  discovery: {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
});

const makePrisma = (tx = makeTx()): { prisma: PrismaClient; tx: ReturnType<typeof makeTx> } => {
  const prisma = {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx };
};

const makeRepo = (existing: CompetitorRecord[] = []): ICompetitorDedupRepository => ({
  findByDomains: vi.fn().mockResolvedValue(existing),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeduplicationEngineService', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  // ── Empty / trivial input ────────────────────────────────────────────────────

  it('returns empty output for empty input', async () => {
    const { prisma } = makePrisma();
    const service = new DeduplicationEngineService(prisma, makeRepo(), logger);

    const result = await service.process([]);

    expect(result.newCompetitors).toHaveLength(0);
    expect(result.existingCompetitors).toHaveLength(0);
    expect(result.duplicateDiscoveries).toHaveLength(0);
    expect(result.stats.totalProcessed).toBe(0);
  });

  // ── All new competitors ──────────────────────────────────────────────────────

  it('classifies all as new when DB has no existing competitors', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([
      makeCompetitorRecord('speero.com'),
      makeCompetitorRecord('vwo.com'),
    ]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    const result = await service.process([makeInput('speero.com'), makeInput('vwo.com')]);

    expect(result.newCompetitors).toHaveLength(2);
    expect(result.existingCompetitors).toHaveLength(0);
    expect(result.stats.newCount).toBe(2);
    expect(result.stats.existingCount).toBe(0);
  });

  it('calls competitor.createMany with correct data for new domains', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([makeCompetitorRecord('speero.com')]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    await service.process([makeInput('speero.com')]);

    expect(tx.competitor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ normalizedDomain: 'speero.com', discoverySource: 'groq' }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  // ── All existing competitors ─────────────────────────────────────────────────

  it('classifies all as existing when DB has all competitors', async () => {
    const existing = [makeCompetitorRecord('speero.com'), makeCompetitorRecord('vwo.com')];
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue(existing);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo(existing), logger);
    const result = await service.process([makeInput('speero.com'), makeInput('vwo.com')]);

    expect(result.newCompetitors).toHaveLength(0);
    expect(result.existingCompetitors).toHaveLength(2);
    expect(result.stats.existingCount).toBe(2);
    expect(result.stats.newCount).toBe(0);
  });

  it('does NOT call competitor.createMany when all are existing', async () => {
    const existing = [makeCompetitorRecord('speero.com')];
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue(existing);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo(existing), logger);
    await service.process([makeInput('speero.com')]);

    expect(tx.competitor.createMany).not.toHaveBeenCalled();
  });

  it('calls competitor.updateMany with existing domains', async () => {
    const existing = [makeCompetitorRecord('speero.com')];
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue(existing);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo(existing), logger);
    await service.process([makeInput('speero.com')]);

    expect(tx.competitor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { normalizedDomain: { in: ['speero.com'] } },
        data: expect.objectContaining({ lastDiscoveredAt: expect.any(Date) }),
      }),
    );
  });

  // ── Mixed: some new, some existing ──────────────────────────────────────────

  it('correctly splits mixed batch into new and existing', async () => {
    const existing = [makeCompetitorRecord('speero.com')];
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([
      makeCompetitorRecord('speero.com'),
      makeCompetitorRecord('vwo.com'),
    ]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo(existing), logger);
    const result = await service.process([makeInput('speero.com'), makeInput('vwo.com')]);

    expect(result.newCompetitors.map((c) => c.normalizedDomain)).toContain('vwo.com');
    expect(result.existingCompetitors.map((c) => c.normalizedDomain)).toContain('speero.com');
  });

  // ── Discovery events always created ─────────────────────────────────────────

  it('always creates discovery events for all unique results', async () => {
    const existing = [makeCompetitorRecord('speero.com', 'id-speero')];
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([
      makeCompetitorRecord('speero.com', 'id-speero'),
      makeCompetitorRecord('vwo.com', 'id-vwo'),
    ]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo(existing), logger);
    await service.process([makeInput('speero.com'), makeInput('vwo.com')]);

    expect(tx.discovery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ competitorId: 'id-speero', queryId: QUERY_ID }),
          expect.objectContaining({ competitorId: 'id-vwo', queryId: QUERY_ID }),
        ]),
      }),
    );
  });

  it('sets correct source and discoveryMethod on discovery records', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([makeCompetitorRecord('speero.com', 'id-speero')]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    await service.process([{ ...makeInput('speero.com'), source: 'stub-search', discoveryMethod: 'web-search' }]);

    expect(tx.discovery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ source: 'stub-search', discoveryMethod: 'web-search' }),
        ]),
      }),
    );
  });

  // ── In-batch deduplication ───────────────────────────────────────────────────

  it('removes in-batch duplicates before DB processing', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([makeCompetitorRecord('speero.com')]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    const result = await service.process([
      makeInput('speero.com'),
      makeInput('speero.com'), // duplicate
      makeInput('speero.com'), // duplicate
    ]);

    expect(result.duplicateDiscoveries).toHaveLength(2);
    expect(result.stats.duplicateCount).toBe(2);
    expect(result.stats.totalProcessed).toBe(3);
    // Only 1 unique domain passed to DB
    expect(tx.competitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { normalizedDomain: { in: ['speero.com'] } } }),
    );
  });

  it('cross-provider duplicates are caught by in-batch dedup', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([makeCompetitorRecord('speero.com')]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    const result = await service.process([
      makeInput('speero.com'), // from groq
      { ...makeInput('speero.com'), source: 'stub-search' }, // same domain, different provider
    ]);

    expect(result.duplicateDiscoveries).toHaveLength(1);
    expect(result.duplicateDiscoveries[0]?.source).toBe('stub-search');
  });

  // ── Stats ────────────────────────────────────────────────────────────────────

  it('stats.totalProcessed equals the original input count (before batch dedup)', async () => {
    const tx = makeTx();
    // findMany must return all domains that were upserted (a.com + b.com)
    tx.competitor.findMany.mockResolvedValue([
      makeCompetitorRecord('a.com'),
      makeCompetitorRecord('b.com'),
    ]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    const result = await service.process([
      makeInput('a.com'), makeInput('a.com'), makeInput('b.com'),
    ]);

    expect(result.stats.totalProcessed).toBe(3);
    expect(result.stats.duplicateCount).toBe(1);
    expect(result.stats.newCount).toBe(2); // a.com and b.com are new (a.com dup was removed)
  });

  // ── Output fields ─────────────────────────────────────────────────────────────

  it('includes competitorId from DB on each processed competitor', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([makeCompetitorRecord('speero.com', 'the-db-id')]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    const result = await service.process([makeInput('speero.com')]);

    expect(result.newCompetitors[0]?.competitorId).toBe('the-db-id');
  });

  it('preserves queryId, source, discoveryMethod in output', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([makeCompetitorRecord('speero.com', 'id-1')]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    const result = await service.process([
      { ...makeInput('speero.com'), source: 'stub-search', discoveryMethod: 'web-search' },
    ]);

    const c = result.newCompetitors[0]!;
    expect(c.queryId).toBe(QUERY_ID);
    expect(c.source).toBe('stub-search');
    expect(c.discoveryMethod).toBe('web-search');
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  it('throws DeduplicationError on invalid input', async () => {
    const { prisma } = makePrisma();
    const service = new DeduplicationEngineService(prisma, makeRepo(), logger);

    await expect(
      service.process([{ ...makeInput('speero.com'), queryId: 'not-a-uuid' }]),
    ).rejects.toThrow('Input validation failed');
  });

  // ── DB failure handling ──────────────────────────────────────────────────────

  it('throws DeduplicationError when DB lookup fails', async () => {
    const { prisma } = makePrisma();
    const brokenRepo: ICompetitorDedupRepository = {
      findByDomains: vi.fn().mockRejectedValue(new Error('DB connection refused')),
    };
    const service = new DeduplicationEngineService(prisma, brokenRepo, logger);

    await expect(service.process([makeInput('speero.com')])).rejects.toThrow('Failed to query existing competitors');
    expect(logger.error).toHaveBeenCalled();
  });

  it('throws DeduplicationError when transaction fails', async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(new Error('Transaction timeout')),
    } as unknown as PrismaClient;

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);

    await expect(service.process([makeInput('speero.com')])).rejects.toThrow('DB transaction failed');
    expect(logger.error).toHaveBeenCalled();
  });

  // ── Logging ────────────────────────────────────────────────────────────────

  it('logs start and completion at info level', async () => {
    const tx = makeTx();
    tx.competitor.findMany.mockResolvedValue([makeCompetitorRecord('speero.com', 'id-1')]);
    const { prisma } = makePrisma(tx);

    const service = new DeduplicationEngineService(prisma, makeRepo([]), logger);
    await service.process([makeInput('speero.com')]);

    // info logs: 1) processing batch  2) classification complete  3) batch processing complete
    expect(logger.info).toHaveBeenCalledTimes(3);
  });
});
