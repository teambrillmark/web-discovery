// Deterministic weighted relevance scorer.
//
// WHY deterministic scoring instead of AI scoring?
// Architecture rule: AI extracts profiles; deterministic code scores them.
// This ensures:
//   • Reproducible results (same input → same score always)
//   • Explainable signals (we know exactly why a score is what it is)
//   • No "AI-decided ranking" — the ranking is a function of structured data
//
// SCORING WEIGHTS (total = 100 points):
//   specialtyOverlap:     30 — what they compete on (dominant signal)
//   identitySimilarity:   20 — how they position in the market
//   businessTypeMatch:    25 — competitive distance: how directly they compete for the same budget
//   industryMatch:        10 — same industry domain
//   audienceOverlap:      10 — same target buyers
//   serviceOverlap:        5 — same service mix (supporting signal)
//
// WHY businessTypeMatch (25) now ranks alongside specialty (30)?
//   • Pre-calibration: businessTypeMatch used blended taxonomyAlignment, giving
//     Agency↔SaaS a score of ~0.53 (vs Agency↔Agency ~0.93). Gap: only 6 pts.
//     This allowed SaaS tools sharing CRO/experimentation terminology to outscore
//     direct service competitors by accumulating specialty points.
//   • Phase 3A fix: businessTypeMatch now uses competitiveDistance() — a pure
//     business-model-to-business-model budget-competition signal.
//     Agency↔Agency = 1.0 → 25 pts. Agency↔SaaS = 0.55 → 13.75 pts. Gap: 11.25 pts.
//   • taxonomyAlignment() is still computed for observability (matchedSignals.taxonomyAlignment)
//     but no longer drives the score.
//
// CONFIDENCE THRESHOLDS:
//   high:   score >= 70
//   medium: score >= 40
//   low:    score <  40

import type { CompetitorProfile, MatchedSignals, ScoringResult } from '../types';
import {
  jaccardSimilarity,
  tokenOverlap,
  normalizeText,
  industryMatch as industryMatchFn,
  sharedTokens,
} from './comparator';
import {
  classifyCompanyTaxonomy,
  taxonomyAlignment as computeTaxonomyAlignment,
  competitiveDistance as computeCompetitiveDistance,
  classifyCompetitiveRelationship,
  type CompanyTaxonomy,
  type CompetitiveRelationship,
} from '../../../semantic/taxonomy';
import type { ScoreContributions } from '../types';
import { semanticSpecialtyOverlap } from '../../../semantic/semantic-matcher';

// Profile completeness: measures how rich the extracted profile is (0–1).
// Used to compute scoreConfidence alongside the relevance score itself.
export function profileCompleteness(profile: CompetitorProfile): number {
  let filled = 0;
  if (profile.companyType)                      filled += 1;
  if (profile.industry)                          filled += 1;
  if (profile.niche)                             filled += 1;
  if (profile.primaryCompetitiveIdentity)        filled += 2; // double weight — most diagnostic
  if (profile.primarySpecialties.length >= 2)   filled += 2;
  if (profile.targetAudience.length >= 1)        filled += 1;
  return filled / 8; // max = 8
}

const WEIGHTS = {
  specialtyOverlap:    30,  // ↓ from 35 — still dominant but balanced against delivery model
  identitySimilarity:  20,  // ↓ from 25 — positioning signal
  businessTypeMatch:   25,  // ↑ from 15 — competitive distance is now the primary structural signal
  industryMatch:       10,  // = unchanged
  audienceOverlap:     10,  // = unchanged
  serviceOverlap:       5,  // = unchanged
} as const;

export function scoreCompetitor(
  target: CompetitorProfile,
  competitor: CompetitorProfile,
): ScoringResult {
  // ── Compute signals ──────────────────────────────────────────────────────────

  // Taxonomy classification — used for both competitive distance and observability.
  const targetTaxonomy     = classifyCompanyTaxonomy(target);
  const competitorTaxonomy = classifyCompanyTaxonomy(competitor);

  // taxonomyAlignment: blended (businessModel + group + delivery + market).
  // Stored in matchedSignals for observability; NOT used for scoring in Phase 3A+.
  const taxAlignment = computeTaxonomyAlignment(targetTaxonomy, competitorTaxonomy);

  // competitiveDistance: pure business-model-to-business-model budget proximity.
  // Guards: if either party is fully unclassifiable (Other + no groups), distance = 0
  // so completely unknown profiles still score 0 on this component.
  const targetUnknown     = targetTaxonomy.businessModel === 'Other' && targetTaxonomy.primaryGroups.length === 0;
  const competitorUnknown = competitorTaxonomy.businessModel === 'Other' && competitorTaxonomy.primaryGroups.length === 0;
  const compDistance = (targetUnknown || competitorUnknown)
    ? 0
    : computeCompetitiveDistance(targetTaxonomy.businessModel, competitorTaxonomy.businessModel);

  const industryMatched = industryMatchFn(target.industry, competitor.industry);

  // Ontology-aware specialty overlap. Falls back to token Jaccard when specialties
  // don't map to known groups (outside the 13-group ontology).
  const semanticResult    = semanticSpecialtyOverlap(target.primarySpecialties, competitor.primarySpecialties);
  const identitySimScore  = tokenOverlap(
    target.primaryCompetitiveIdentity ?? '',
    competitor.primaryCompetitiveIdentity ?? '',
  );
  const audienceJaccard   = jaccardSimilarity(target.targetAudience, competitor.targetAudience);
  const serviceJaccard    = jaccardSimilarity(target.coreServices, competitor.coreServices);

  // Competitive relationship classification — direct / adjacent / peripheral.
  // Used in reasoning strings and matchedSignals (not for score calculation).
  const relationship: CompetitiveRelationship = (targetUnknown || competitorUnknown)
    ? 'peripheral'
    : classifyCompetitiveRelationship(
        targetTaxonomy.businessModel,
        competitorTaxonomy.businessModel,
        semanticResult.score,
      );

  // Boolean businessTypeMatch: true when competitive distance is high (direct competitor).
  const businessTypeMatch = compDistance >= 0.85;

  // ── Weighted sum → 0–100 score ───────────────────────────────────────────────
  // businessTypeMatch uses competitiveDistance (pure model proximity), NOT taxAlignment.
  // taxAlignment is retained in matchedSignals for observability only.
  const contributions: ScoreContributions = {
    specialty:     semanticResult.score  * WEIGHTS.specialtyOverlap,
    identity:      identitySimScore      * WEIGHTS.identitySimilarity,
    businessModel: compDistance          * WEIGHTS.businessTypeMatch,
    industry:      industryMatched       ? WEIGHTS.industryMatch : 0,
    audience:      audienceJaccard       * WEIGHTS.audienceOverlap,
    service:       serviceJaccard        * WEIGHTS.serviceOverlap,
  };
  const rawScore =
    contributions.specialty +
    contributions.identity +
    contributions.businessModel +
    contributions.industry +
    contributions.audience +
    contributions.service;

  const relevanceScore = Math.round(Math.min(rawScore, 100));

  // scoreConfidence combines score threshold with profile completeness.
  // A high score from a skeletal profile is downgraded to 'medium' — we're less
  // sure the score is accurate if the AI couldn't fill in most profile fields.
  const completeness = profileCompleteness(competitor);
  const scoreConfidence: 'high' | 'medium' | 'low' =
    relevanceScore >= 70 && completeness >= 0.5 ? 'high' :
    relevanceScore >= 70 ? 'medium' :        // high score but thin profile
    relevanceScore >= 40 ? 'medium' : 'low';

  const matchedSignals: MatchedSignals = {
    businessTypeMatch,
    industryMatch:             industryMatched,
    specialtyOverlap:          round2(semanticResult.score),
    audienceOverlap:           round2(audienceJaccard),
    serviceOverlap:            round2(serviceJaccard),
    identitySimilarity:        round2(identitySimScore),
    semanticGroups:            semanticResult.competitorGroups.length > 0
                                 ? semanticResult.competitorGroups
                                 : undefined,
    taxonomyAlignment:         round2(taxAlignment),
    competitiveDistance:       round2(compDistance),
    competitiveRelationship:   relationship,
  };

  const scoringReasoning = buildReasoning(
    target, competitor, matchedSignals,
    compDistance, relationship,
    semanticResult.reasoning, competitorTaxonomy, contributions,
  );

  return {
    domain:                   competitor.domain,
    profile:                  competitor,
    relevanceScore,
    scoreConfidence,
    matchedSignals,
    scoringReasoning,
    businessModel:            competitorTaxonomy.businessModel,
    businessModelConfidence:  competitorTaxonomy.businessModelConfidence,
    scoreContributions:       contributions,
  };
}

export function rankCompetitors(
  target: CompetitorProfile,
  competitors: CompetitorProfile[],
): ScoringResult[] {
  return competitors
    .map((c) => scoreCompetitor(target, c))
    .sort((a, b) => {
      // Primary: relevance score descending
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      // Tie-break: AI profile confidence (high > medium > low)
      return confidenceRank(b.profile.aiConfidence) - confidenceRank(a.profile.aiConfidence);
    });
}

// ── Reasoning builder ─────────────────────────────────────────────────────────

function buildReasoning(
  target: CompetitorProfile,
  competitor: CompetitorProfile,
  signals: MatchedSignals,
  compDistance: number,
  relationship: CompetitiveRelationship,
  semanticReasoning?: string,
  competitorTaxonomy?: CompanyTaxonomy,
  contributions?: ScoreContributions,
): string[] {
  const reasons: string[] = [];

  // ── Competitive relationship (lead signal — structural context for the score) ─
  if (relationship === 'direct') {
    const typeLabel = competitorTaxonomy?.businessModel ?? competitor.companyType ?? '';
    reasons.push(`direct competitor${typeLabel ? ': ' + typeLabel : ''}`);
  } else if (relationship === 'adjacent') {
    const targetType     = target.companyType ?? '';
    const competitorType = competitorTaxonomy?.businessModel ?? competitor.companyType ?? '';
    if (targetType && competitorType && targetType !== competitorType) {
      reasons.push(`adjacent competitor: ${competitorType} vs ${targetType} (${pct(compDistance)} competitive distance)`);
    } else {
      reasons.push(`adjacent competitor (${pct(compDistance)} competitive distance)`);
    }
  } else if (relationship === 'peripheral') {
    const competitorType = competitorTaxonomy?.businessModel ?? competitor.companyType ?? '';
    if (competitorType && competitorType !== 'Other') {
      reasons.push(`peripheral: ${competitorType} — different competitive space`);
    }
  }

  // ── Specialty overlap ─────────────────────────────────────────────────────────
  if (signals.specialtyOverlap >= 0.6) {
    const detail = semanticReasoning ?? (() => {
      const shared = sharedTokens(target.primarySpecialties, competitor.primarySpecialties);
      return shared.length ? shared.slice(0, 3).join(', ') : '';
    })();
    reasons.push(`strong specialty overlap (${pct(signals.specialtyOverlap)})${detail ? ': ' + detail : ''}`);
  } else if (signals.specialtyOverlap >= 0.2) {
    const detail = semanticReasoning ?? (() => {
      const shared = sharedTokens(target.primarySpecialties, competitor.primarySpecialties);
      return shared.length ? shared.slice(0, 2).join(', ') : '';
    })();
    reasons.push(`partial specialty overlap (${pct(signals.specialtyOverlap)})${detail ? ': ' + detail : ''}`);
  }

  // ── Identity similarity ───────────────────────────────────────────────────────
  if (signals.identitySimilarity >= 0.5) {
    const identity = competitor.primaryCompetitiveIdentity ?? '';
    reasons.push(`similar competitive identity (${pct(signals.identitySimilarity)})${identity ? ': ' + identity : ''}`);
  } else if (signals.identitySimilarity >= 0.25) {
    reasons.push(`partial identity overlap (${pct(signals.identitySimilarity)})`);
  }

  // ── Industry / audience / service ────────────────────────────────────────────
  if (signals.industryMatch && target.industry) {
    reasons.push(`same industry: ${target.industry}`);
  }

  if (signals.audienceOverlap >= 0.4) {
    const shared = sharedTokens(target.targetAudience, competitor.targetAudience);
    reasons.push(`similar audience (${pct(signals.audienceOverlap)})${shared.length ? ': ' + shared.slice(0, 2).join(', ') : ''}`);
  } else if (signals.audienceOverlap >= 0.2) {
    reasons.push(`partial audience overlap (${pct(signals.audienceOverlap)})`);
  }

  if (signals.serviceOverlap >= 0.3) {
    reasons.push(`overlapping service mix (${pct(signals.serviceOverlap)})`);
  }

  // ── Mixed-model observability ─────────────────────────────────────────────────
  if (competitorTaxonomy) {
    const conf = competitorTaxonomy.businessModelConfidence;
    const sorted = (Object.entries(conf) as [string, number][]).sort((a, b) => b[1] - a[1]);
    const [topModel, topScore] = sorted[0] ?? ['Other', 0];
    const [secondModel, secondScore] = sorted[1] ?? ['Other', 0];
    if (topScore < 0.55 && secondScore > 0.2 && topModel !== 'Other' && secondModel !== 'Other') {
      reasons.push(`mixed business model: ${topModel} (${pct(topScore)}) / ${secondModel} (${pct(secondScore)})`);
    }
  }

  // ── Score contribution summary (only when contributions are present) ───────────
  if (contributions) {
    const topContributors = [
      { label: 'specialty', pts: contributions.specialty },
      { label: 'business model', pts: contributions.businessModel },
      { label: 'identity', pts: contributions.identity },
      { label: 'industry', pts: contributions.industry },
      { label: 'audience', pts: contributions.audience },
    ]
      .filter((c) => c.pts >= 3)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 3);
    if (topContributors.length > 0) {
      reasons.push(`score drivers: ${topContributors.map((c) => `${c.label} +${Math.round(c.pts)}`).join(', ')}`);
    }
  }

  if (reasons.length === 0) {
    reasons.push('weak competitive overlap — different niche or audience');
  }

  return reasons;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function confidenceRank(c: 'high' | 'medium' | 'low' | null | undefined): number {
  if (c === 'high')   return 2;
  if (c === 'medium') return 1;
  return 0;
}

// Returns which specialties were semantically normalized — for debug logging.
// Shows the raw → canonical mapping so operators can audit normalization quality.
export function normalizedSpecialtyDiff(specialties: string[]): { original: string; normalized: string }[] {
  return specialties
    .map((s) => ({ original: s, normalized: normalizeText(s).trim() }))
    .filter((d) => d.original.toLowerCase() !== d.normalized);
}
