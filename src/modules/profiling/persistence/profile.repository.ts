import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../../lib/logger';
import type { CompetitorProfile, StoredProfile } from '../types';

export interface IProfileRepository {
  saveMany(profiles: StoredProfile[]): Promise<void>;
  // Optional — implementations that back a DB can populate the profile cache.
  findRecentByDomains?(domains: string[], maxAgeDays: number): Promise<Map<string, CompetitorProfile>>;
}

export class ProfileRepository implements IProfileRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async saveMany(profiles: StoredProfile[]): Promise<void> {
    if (profiles.length === 0) return;

    const logCtx = { count: profiles.length };
    this.logger.info(logCtx, 'ProfileRepository: saving profiles');

    // Upsert by (domain, queryId) — safe to re-run if the route retries
    const ops = profiles.map((p) =>
      this.prisma.competitorProfile.upsert({
        where: { domain_queryId: { domain: p.domain, queryId: p.queryId } },
        create: {
          domain:                     p.domain,
          queryId:                    p.queryId,
          companyType:                p.companyType,
          industry:                   p.industry,
          niche:                      p.niche,
          primaryCompetitiveIdentity: p.primaryCompetitiveIdentity,
          primarySpecialties:         p.primarySpecialties,
          coreServices:               p.coreServices,
          targetAudience:             p.targetAudience,
          positioning:                p.positioning,
          aiConfidence:               p.aiConfidence,
          relevanceScore:             p.relevanceScore,
          scoreConfidence:            p.scoreConfidence,
          matchedSignals:             p.matchedSignals as object,
          scoringReasoning:           p.scoringReasoning,
        },
        update: {
          companyType:                p.companyType,
          industry:                   p.industry,
          niche:                      p.niche,
          primaryCompetitiveIdentity: p.primaryCompetitiveIdentity,
          primarySpecialties:         p.primarySpecialties,
          coreServices:               p.coreServices,
          targetAudience:             p.targetAudience,
          positioning:                p.positioning,
          aiConfidence:               p.aiConfidence,
          relevanceScore:             p.relevanceScore,
          scoreConfidence:            p.scoreConfidence,
          matchedSignals:             p.matchedSignals as object,
          scoringReasoning:           p.scoringReasoning,
        },
      }),
    );

    try {
      // Execute all upserts in a single transaction
      await this.prisma.$transaction(ops);
      this.logger.info({ count: profiles.length }, 'ProfileRepository: profiles saved');
    } catch (err) {
      // Non-fatal — ranking still works; we just lose persistence for this run
      this.logger.error({ error: err, count: profiles.length }, 'ProfileRepository: save failed — ranking continues without persistence');
    }
  }

  // Returns profiles saved in any recent run for the given domains.
  // Only returns profiles with at least medium AI confidence (skips empty/fallback ones).
  // Used by ProfilingService to avoid re-calling Groq for recently profiled competitors.
  async findRecentByDomains(domains: string[], maxAgeDays: number): Promise<Map<string, CompetitorProfile>> {
    if (domains.length === 0) return new Map();

    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    try {
      const rows = await this.prisma.competitorProfile.findMany({
        where: {
          domain:      { in: domains },
          aiConfidence: { in: ['high', 'medium'] },
          createdAt:   { gte: cutoff },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Keep only the most-recent profile per domain
      const result = new Map<string, CompetitorProfile>();
      for (const row of rows) {
        if (!result.has(row.domain)) {
          result.set(row.domain, {
            domain:                     row.domain,
            companyType:                row.companyType,
            industry:                   row.industry,
            niche:                      row.niche,
            primaryCompetitiveIdentity: row.primaryCompetitiveIdentity,
            primarySpecialties:         (row.primarySpecialties as string[]) ?? [],
            coreServices:               (row.coreServices as string[]) ?? [],
            targetAudience:             (row.targetAudience as string[]) ?? [],
            positioning:                row.positioning,
            aiConfidence:               row.aiConfidence as 'high' | 'medium' | 'low',
          });
        }
      }

      this.logger.debug(
        { requested: domains.length, found: result.size, maxAgeDays },
        'ProfileRepository: cache lookup complete',
      );
      return result;
    } catch (err) {
      // Non-fatal — caller falls back to fresh Groq extraction
      this.logger.warn({ error: err }, 'ProfileRepository: cache lookup failed — will re-profile');
      return new Map();
    }
  }
}
