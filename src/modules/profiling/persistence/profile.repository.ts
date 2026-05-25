import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../../lib/logger';
import type { StoredProfile } from '../types';

export interface IProfileRepository {
  saveMany(profiles: StoredProfile[]): Promise<void>;
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
}
