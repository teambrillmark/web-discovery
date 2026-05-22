import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../../lib/logger';
import type { ICompetitorDedupRepository } from '../repositories/competitor.dedup.repository';
import { deduplicateBatch } from '../utils/batch.utils';
import { DeduplicationInputSchema } from '../validators/deduplication.validator';
import { DeduplicationError } from '../types';
import type {
  DeduplicationInput,
  DeduplicationOutput,
  ProcessedCompetitor,
} from '../types';

export class DeduplicationEngineService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly competitorRepo: ICompetitorDedupRepository,
    private readonly logger: Logger,
  ) {}

  async process(rawInput: DeduplicationInput[]): Promise<DeduplicationOutput> {
    const logCtx = { inputCount: rawInput.length };
    this.logger.info(logCtx, 'DeduplicationEngine: processing batch');

    // ── Validate ─────────────────────────────────────────────────────────────
    const parsed = DeduplicationInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      this.logger.warn({ issues }, 'DeduplicationEngine: input validation failed');
      throw new DeduplicationError(`Input validation failed: ${issues[0]?.message ?? 'unknown'}`);
    }
    const input = parsed.data;

    if (input.length === 0) {
      return {
        newCompetitors: [],
        existingCompetitors: [],
        duplicateDiscoveries: [],
        stats: { totalProcessed: 0, newCount: 0, existingCount: 0, duplicateCount: 0 },
      };
    }

    // ── In-batch deduplication (defensive) ───────────────────────────────────
    const { unique, duplicates } = deduplicateBatch(input);
    if (duplicates.length > 0) {
      this.logger.debug(
        { duplicateCount: duplicates.length },
        'DeduplicationEngine: in-batch duplicates removed',
      );
    }

    // ── Batch DB lookup — O(1) queries ────────────────────────────────────────
    const allDomains = unique.map((r) => r.normalizedDomain);
    let existingRecords;
    try {
      existingRecords = await this.competitorRepo.findByDomains(allDomains);
    } catch (error) {
      this.logger.error({ error }, 'DeduplicationEngine: DB lookup failed');
      throw new DeduplicationError('Failed to query existing competitors', error as Error);
    }

    const existingDomainSet = new Set(existingRecords.map((c) => c.normalizedDomain));
    const newInputs = unique.filter((r) => !existingDomainSet.has(r.normalizedDomain));
    const existingInputs = unique.filter((r) => existingDomainSet.has(r.normalizedDomain));

    this.logger.info(
      { new: newInputs.length, existing: existingInputs.length, inBatchDupes: duplicates.length },
      'DeduplicationEngine: classification complete',
    );

    // ── Atomic transaction ────────────────────────────────────────────────────
    let domainToId: Map<string, string>;
    try {
      domainToId = await this.runTransaction(unique, newInputs, existingInputs, allDomains);
    } catch (error) {
      this.logger.error({ error }, 'DeduplicationEngine: transaction failed');
      throw new DeduplicationError('DB transaction failed during competitor persistence', error as Error);
    }

    // ── Build output ──────────────────────────────────────────────────────────
    const toProcessed = (r: DeduplicationInput): ProcessedCompetitor => ({
      normalizedDomain: r.normalizedDomain,
      competitorId: domainToId.get(r.normalizedDomain) ?? '',
      source: r.source,
      discoveryMethod: r.discoveryMethod,
      queryId: r.queryId,
      discoveredAt: r.discoveredAt,
    });

    const output: DeduplicationOutput = {
      newCompetitors: newInputs.map(toProcessed),
      existingCompetitors: existingInputs.map(toProcessed),
      duplicateDiscoveries: duplicates,
      stats: {
        totalProcessed: input.length,
        newCount: newInputs.length,
        existingCount: existingInputs.length,
        duplicateCount: duplicates.length,
      },
    };

    this.logger.info(
      {
        totalProcessed: output.stats.totalProcessed,
        newCount: output.stats.newCount,
        existingCount: output.stats.existingCount,
        duplicateCount: output.stats.duplicateCount,
      },
      'DeduplicationEngine: batch processing complete',
    );

    return output;
  }

  private async runTransaction(
    unique: DeduplicationInput[],
    newInputs: DeduplicationInput[],
    existingInputs: DeduplicationInput[],
    allDomains: string[],
  ): Promise<Map<string, string>> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create new competitors — skipDuplicates handles concurrent race conditions
      if (newInputs.length > 0) {
        await tx.competitor.createMany({
          data: newInputs.map((r) => ({
            normalizedDomain: r.normalizedDomain,
            rawInput: r.originalValue,
            discoverySource: r.source,
            discoveredAt: new Date(r.discoveredAt),
            lastDiscoveredAt: new Date(r.discoveredAt),
          })),
          skipDuplicates: true,
        });
      }

      // 2. Update lastDiscoveredAt for existing competitors
      if (existingInputs.length > 0) {
        await tx.competitor.updateMany({
          where: { normalizedDomain: { in: existingInputs.map((r) => r.normalizedDomain) } },
          data: { lastDiscoveredAt: new Date() },
        });
      }

      // 3. Fetch all IDs (new + existing) — single batch query
      const all = await tx.competitor.findMany({
        where: { normalizedDomain: { in: allDomains } },
        select: { id: true, normalizedDomain: true },
      });

      const domainToId = new Map(all.map((c) => [c.normalizedDomain, c.id]));

      // 4. Create discovery events for ALL results — historical intelligence preserved
      await tx.discovery.createMany({
        data: unique.map((r) => ({
          competitorId: domainToId.get(r.normalizedDomain) ?? (() => {
            throw new DeduplicationError(
              `No competitor ID found for domain ${r.normalizedDomain} after upsert`,
            );
          })(),
          queryId: r.queryId,
          source: r.source,
          discoveryMethod: r.discoveryMethod,
          originalValue: r.originalValue,
          discoveredAt: new Date(r.discoveredAt),
        })),
      });

      return domainToId;
    });
  }
}
