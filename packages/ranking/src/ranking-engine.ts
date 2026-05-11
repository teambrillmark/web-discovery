import { CompanyEntity, QueryObject, RankedEntity } from '@discovery/shared';

export interface EntityWithMeta extends CompanyEntity {
  firstSeen: Date;
  lastSeen: Date;
  changeCount?: number;
}

export class RankingEngine {
  rank(entities: EntityWithMeta[], queryObj: QueryObject): RankedEntity[] {
    const now = new Date();
    const scored = entities.map(entity => {
      const freshness = this.calculateFreshness(entity.lastSeen, now);
      const isNew = this.isNewEntity(entity.firstSeen, now);
      const score = this.calculateScore(entity, freshness, isNew);

      return {
        entity,
        rank: 0,
        score,
        freshness,
        isNew,
        recentChanges: entity.changeCount ?? 0,
      } as RankedEntity;
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Assign ranks
    scored.forEach((item, index) => {
      item.rank = index + 1;
    });

    return scored;
  }

  private calculateScore(entity: EntityWithMeta, freshness: number, isNew: boolean): number {
    const confidenceWeight = 0.35;
    const relevanceWeight = 0.30;
    const freshnessWeight = 0.20;
    const completenessWeight = 0.15;

    const completeness = this.calculateCompleteness(entity);
    const newEntityBonus = isNew ? 0.1 : 0;

    return (
      entity.confidenceScore * confidenceWeight +
      entity.relevanceScore * relevanceWeight +
      freshness * freshnessWeight +
      completeness * completenessWeight +
      newEntityBonus
    );
  }

  private calculateFreshness(lastSeen: Date, now: Date): number {
    const hoursSince = (now.getTime() - new Date(lastSeen).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 1) return 1.0;
    if (hoursSince < 24) return 0.9;
    if (hoursSince < 72) return 0.7;
    if (hoursSince < 168) return 0.5;
    if (hoursSince < 720) return 0.3;
    return 0.1;
  }

  private isNewEntity(firstSeen: Date, now: Date): boolean {
    const hoursSince = (now.getTime() - new Date(firstSeen).getTime()) / (1000 * 60 * 60);
    return hoursSince < 48;
  }

  private calculateCompleteness(entity: CompanyEntity): number {
    const fields = [
      entity.name,
      entity.description,
      entity.services?.length ? entity.services : null,
      entity.technologies?.length ? entity.technologies : null,
      entity.linkedin,
      entity.emails?.length ? entity.emails : null,
    ];
    const filled = fields.filter(f => f !== null && f !== undefined).length;
    return filled / fields.length;
  }

  sortByFreshness(ranked: RankedEntity[]): RankedEntity[] {
    return [...ranked].sort((a, b) => b.freshness - a.freshness);
  }

  filterByMinScore(ranked: RankedEntity[], minScore: number): RankedEntity[] {
    return ranked.filter(r => r.score >= minScore);
  }
}
