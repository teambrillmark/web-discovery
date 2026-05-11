import { CompanyEntity } from '@discovery/shared';

export class DuplicateDetector {
  private seen: Map<string, CompanyEntity> = new Map();

  isDuplicate(entity: CompanyEntity): boolean {
    return this.seen.has(this.normalizeKey(entity.domain));
  }

  markSeen(entity: CompanyEntity): void {
    this.seen.set(this.normalizeKey(entity.domain), entity);
  }

  findSimilar(entity: CompanyEntity, candidates: CompanyEntity[]): CompanyEntity | null {
    const key = this.normalizeKey(entity.domain);
    for (const candidate of candidates) {
      if (this.normalizeKey(candidate.domain) === key) return candidate;
      if (this.nameSimilarity(entity.name, candidate.name) > 0.85) return candidate;
    }
    return null;
  }

  private normalizeKey(domain: string): string {
    return domain.toLowerCase().replace(/^www\./, '').trim();
  }

  private nameSimilarity(a: string, b: string): number {
    const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (na === nb) return 1;
    const longer = na.length > nb.length ? na : nb;
    const shorter = na.length > nb.length ? nb : na;
    if (longer.length === 0) return 1;
    return (longer.length - this.editDistance(longer, shorter)) / longer.length;
  }

  private editDistance(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
    return dp[a.length][b.length];
  }

  reset(): void {
    this.seen.clear();
  }
}
