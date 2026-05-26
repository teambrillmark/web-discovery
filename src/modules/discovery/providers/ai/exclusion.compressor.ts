// WHY semantic exclusion compression instead of raw domain dumping?
//
// Naive approach: send "exclude these 120 domains" as a bulleted list.
// Problems:
//   - ~600+ tokens wasted on raw domain strings that carry no semantic meaning
//   - The LLM sees 120 names with no context for WHY they're excluded
//   - Discovery prompt is crowded, leaving less room for identity/context signal
//   - No guidance toward unexplored competitor segments
//   - ALL known competitors hard-excluded → eliminates reinforcement rediscovery
//
// Compressed approach:
//   1. Groups profiled competitors into semantic clusters by competitive identity
//      ("14 experimentation agencies already found, e.g. optimizely.com, vwo.com")
//   2. Sends a short hard-exclusion list for weak/unclassified domains only (≤15)
//   3. Lets high-confidence competitors remain discoverable — periodic rediscovery
//      reinforces confidence and validates relevance scores
//   4. Generates exploration guidance toward under-explored segments
//
// WHY allow rediscovery of high-confidence competitors?
//   Strong competitors appearing repeatedly across runs is signal, not noise.
//   It validates their relevance classification and builds confidence.
//   Hard-excluding them locks out this reinforcement mechanism.
//   Low-score candidates are noise — hard-excluding them saves profiling budget.
//
// Rediscovery tiers (based on aiConfidence from stored profiles):
//   high   → never hard-excluded (always rediscoverable, mentioned in cluster summaries)
//   medium → described in semantic clusters, not in hard-exclusion list
//   low    → hard-excluded: cheap filter, prevents re-processing known noise
//   none   → hard-excluded: unknown quality — exclude to avoid redundant AI calls

import type { Logger } from '../../../../lib/logger';
import type { KnownCompetitorSummary } from '../../types';
import type { BusinessContext } from '../../types';

// ── Output types ──────────────────────────────────────────────────────────────

export interface SemanticCluster {
  label: string;
  count: number;
  examples: string[];
}

export interface ExclusionCompressionStats {
  totalExclusions: number;
  clusteredDomains: number;     // described semantically (medium + high confidence)
  hardExcluded: number;         // explicit list in prompt (low confidence / no profile)
  rediscoverableCount: number;  // high-confidence domains intentionally left discoverable
  estimatedTokenReduction: number;
}

export interface CompressedExclusions {
  clusters: SemanticCluster[];
  hardExclusions: string[];
  totalExcluded: number;
  stats: ExclusionCompressionStats;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HARD_EXCLUSIONS   = 15;
const MAX_EXAMPLES_PER_CLUSTER = 2;
const MAX_CLUSTERS_IN_PROMPT   = 6;

// ── ExclusionCompressor ───────────────────────────────────────────────────────

export class ExclusionCompressor {
  constructor(private readonly logger: Logger) {}

  compress(
    exclusions: string[],
    profiles: KnownCompetitorSummary[],
    targetDomain: string,
  ): CompressedExclusions {
    if (exclusions.length === 0) return emptyCompressed();

    const profileMap = new Map(profiles.map((p) => [p.domain, p]));

    // Tier 1: high confidence → rediscoverable (still described in clusters for context)
    // Tier 2: medium confidence → semantic cluster only (soft mention, not hard excluded)
    // Tier 3: low confidence / no profile → hard excluded (explicit list in prompt)
    const clusterMap = new Map<string, KnownCompetitorSummary[]>();
    const hardExcluded: string[] = [];
    let rediscoverableCount = 0;

    for (const domain of exclusions) {
      if (domain === targetDomain) continue;

      const profile = profileMap.get(domain);

      if (!profile || profile.aiConfidence === 'low') {
        hardExcluded.push(domain);
        continue;
      }

      // medium + high → described semantically
      const label = clusterLabel(profile.primaryCompetitiveIdentity, profile.companyType);
      if (!clusterMap.has(label)) clusterMap.set(label, []);
      clusterMap.get(label)!.push(profile);

      if (profile.aiConfidence === 'high') rediscoverableCount++;
    }

    // Build clusters sorted by size desc, capped for prompt length
    const clusters: SemanticCluster[] = [...clusterMap.entries()]
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, MAX_CLUSTERS_IN_PROMPT)
      .map(([label, members]) => ({
        label,
        count: members.length,
        // Show highest-confidence examples first
        examples: [...members]
          .sort((a, b) => confidenceRank(b.aiConfidence) - confidenceRank(a.aiConfidence))
          .slice(0, MAX_EXAMPLES_PER_CLUSTER)
          .map((p) => p.domain),
      }));

    const limitedHardExclusions = hardExcluded.slice(0, MAX_HARD_EXCLUSIONS);
    const clusteredDomains = [...clusterMap.values()].reduce((s, arr) => s + arr.length, 0);

    // Estimate: each raw exclusion costs ~5 tokens; cluster summary costs ~15 tokens flat.
    // Savings = tokens_saved_on_raw_list - tokens_added_for_cluster_summary.
    const tokensSavedOnRaw    = hardExcluded.length * 5 + clusteredDomains * 5;
    const tokensUsedForClusters = clusters.length * 15 + limitedHardExclusions.length * 5;
    const estimatedTokenReduction = Math.max(0, tokensSavedOnRaw - tokensUsedForClusters);

    const stats: ExclusionCompressionStats = {
      totalExclusions: exclusions.length,
      clusteredDomains,
      hardExcluded: limitedHardExclusions.length,
      rediscoverableCount,
      estimatedTokenReduction,
    };

    this.logger.info(
      {
        totalExclusions:        stats.totalExclusions,
        clusters:               clusters.length,
        clusteredDomains:       stats.clusteredDomains,
        hardExcluded:           stats.hardExcluded,
        hardExcludedTotal:      hardExcluded.length,
        hardExcludedDropped:    hardExcluded.length - limitedHardExclusions.length,
        rediscoverableCount:    stats.rediscoverableCount,
        estimatedTokenReduction: stats.estimatedTokenReduction,
      },
      'ExclusionCompressor: compression complete',
    );

    return {
      clusters,
      hardExclusions: limitedHardExclusions,
      totalExcluded: exclusions.length,
      stats,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clusterLabel(identity: string | null | undefined, companyType: string | null | undefined): string {
  if (identity && identity !== 'Unknown' && identity.length > 3) {
    return identity.replace(/\.$/, '').trim();
  }
  if (companyType) return `${companyType} (unclassified)`;
  return 'Other';
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0;
}

function emptyCompressed(): CompressedExclusions {
  return {
    clusters: [],
    hardExclusions: [],
    totalExcluded: 0,
    stats: {
      totalExclusions: 0, clusteredDomains: 0,
      hardExcluded: 0, rediscoverableCount: 0, estimatedTokenReduction: 0,
    },
  };
}
