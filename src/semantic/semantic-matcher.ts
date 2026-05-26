import {
  DEFAULT_ONTOLOGY,
  mapToSemanticGroups,
  groupSimilarity,
  type SemanticGroup,
} from './ontology';

// ── Semantic specialty overlap ────────────────────────────────────────────────
//
// WHY this is the primary specialty signal (not comparator.ts Jaccard)?
//   Pure token Jaccard on specialties breaks at cluster boundaries. "A/B Testing"
//   and "Conversion Rate Optimization" share zero tokens → Jaccard 0. But the
//   ontology knows they're related groups (CRO ↔ EXPERIMENTATION = 0.75).
//
//   This function provides ontology-aware partial credit:
//     - Maps each specialty list to ontology group IDs
//     - For each target group, finds the best-matching competitor group
//     - Averages best-match scores → 0-1 result (one-sided coverage metric)
//
//   Fallback: when specialties don't map to any known group (outside the 13-group
//   ontology), falls back to token Jaccard on the raw specialty strings. This keeps
//   the scorer domain-agnostic for companies outside the B2B marketing space.
//   The fallback is flagged via usedFallback=true so callers can weight it
//   appropriately.

export interface SemanticOverlapResult {
  score: number;            // 0-1 overall semantic overlap
  directGroups: string[];   // group IDs that matched directly (score 1.0)
  partialGroups: Array<{    // groups that matched via relatedness
    targetGroup: string;
    competitorGroup: string;
    similarity: number;
  }>;
  targetGroups: string[];     // ontology group IDs mapped from targetSpecialties
  competitorGroups: string[]; // ontology group IDs mapped from competitorSpecialties
  usedFallback: boolean;      // true when Jaccard token fallback was used (no groups found)
  reasoning: string;          // human-readable explanation
}

/**
 * Computes ontology-aware semantic overlap between two specialty lists.
 * Falls back to token Jaccard when neither list maps to known ontology groups.
 * Returns a 0-1 score and explainability metadata.
 */
export function semanticSpecialtyOverlap(
  targetSpecialties: string[],
  competitorSpecialties: string[],
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
): SemanticOverlapResult {
  const EMPTY: SemanticOverlapResult = {
    score: 0, directGroups: [], partialGroups: [],
    targetGroups: [], competitorGroups: [], usedFallback: false,
    reasoning: 'no specialties to compare',
  };

  if (targetSpecialties.length === 0 || competitorSpecialties.length === 0) {
    return EMPTY;
  }

  const targetGroups    = mapToSemanticGroups(targetSpecialties, ontology);
  const competitorGroups = mapToSemanticGroups(competitorSpecialties, ontology);

  // ── Fallback: neither side maps to known groups ───────────────────────────
  if (targetGroups.length === 0 || competitorGroups.length === 0) {
    const fallbackScore = jaccardFallback(targetSpecialties, competitorSpecialties);
    return {
      score: fallbackScore,
      directGroups: [], partialGroups: [],
      targetGroups, competitorGroups,
      usedFallback: true,
      reasoning: fallbackScore > 0
        ? `token overlap fallback: ${Math.round(fallbackScore * 100)}% (no ontology groups found)`
        : 'no ontology groups found; no token overlap',
    };
  }

  // ── Ontology-aware scoring ────────────────────────────────────────────────
  const directGroups: string[] = [];
  const partialGroups: SemanticOverlapResult['partialGroups'] = [];
  const scores: number[] = [];

  for (const tg of targetGroups) {
    let bestScore = 0;
    let bestCg = '';

    for (const cg of competitorGroups) {
      const sim = groupSimilarity(tg, cg, ontology);
      if (sim > bestScore) {
        bestScore = sim;
        bestCg = cg;
      }
    }

    if (bestScore >= 1.0) {
      directGroups.push(tg);
    } else if (bestScore >= 0.3) {
      partialGroups.push({ targetGroup: tg, competitorGroup: bestCg, similarity: bestScore });
    }

    scores.push(bestScore);
  }

  const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const reasoning = buildSemanticReasoning(directGroups, partialGroups, score, ontology);

  return {
    score: Math.round(score * 100) / 100,
    directGroups, partialGroups,
    targetGroups, competitorGroups,
    usedFallback: false,
    reasoning,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Inline tokenizer for Jaccard fallback — no dependency on comparator.ts.
// Deliberately simple: lowercase, split on non-alphanumeric, filter length ≥ 2.
function fallbackTokens(arr: string[]): Set<string> {
  const result = new Set<string>();
  for (const s of arr) {
    for (const tok of s.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length >= 2) result.add(tok);
    }
  }
  return result;
}

function jaccardFallback(a: string[], b: string[]): number {
  const setA = fallbackTokens(a);
  const setB = fallbackTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function buildSemanticReasoning(
  directGroups: string[],
  partialGroups: SemanticOverlapResult['partialGroups'],
  score: number,
  ontology: SemanticGroup[],
): string {
  const labelMap = new Map(ontology.map((g) => [g.id, g.label]));
  const parts: string[] = [];

  if (directGroups.length > 0) {
    const labels = directGroups.map((id) => labelMap.get(id) ?? id);
    parts.push(`direct match: ${labels.join(', ')}`);
  }

  if (partialGroups.length > 0) {
    const pgLabels = partialGroups.map(({ targetGroup, competitorGroup, similarity }) => {
      const tLabel = labelMap.get(targetGroup) ?? targetGroup;
      const cLabel = labelMap.get(competitorGroup) ?? competitorGroup;
      return `${tLabel}↔${cLabel} (${Math.round(similarity * 100)}%)`;
    });
    parts.push(`related: ${pgLabels.join('; ')}`);
  }

  if (parts.length === 0) {
    return score < 0.15 ? 'no meaningful semantic overlap' : 'weak semantic overlap';
  }

  return parts.join(' | ');
}
