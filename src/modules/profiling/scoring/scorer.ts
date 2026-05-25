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
//   specialtyOverlap:     35 — what they compete on (dominant signal)
//   identitySimilarity:   25 — how they position in the market
//   businessTypeMatch:    15 — same type of company (Agency vs SaaS vs Platform)
//   industryMatch:        10 — same industry domain
//   audienceOverlap:      10 — same target buyers
//   serviceOverlap:        5 — same service mix (supporting signal)
//
// WHY specialty (35) and identity (25) dominate?
//   • A CRO SaaS and a CRO Agency both compete for the "CRO budget" — the company
//     type difference (15 points max) matters less than the specialty alignment (35).
//   • Pre-calibration: businessTypeMatch (20) and industryMatch (15) were too heavy,
//     causing a SaaS-vs-Agency score gap even when both serve the same niche.
//     Reducing them separates competition signal from category signal.
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
  specialtyOverlap:    35,  // ↑ from 30 — dominant competitive signal
  identitySimilarity:  25,  // ↑ from 20 — market positioning similarity
  businessTypeMatch:   15,  // ↓ from 20 — type matters less than what they do
  industryMatch:       10,  // ↓ from 15 — industry is context, not differentiator
  audienceOverlap:     10,  // = unchanged
  serviceOverlap:       5,  // = unchanged
} as const;

export function scoreCompetitor(
  target: CompetitorProfile,
  competitor: CompetitorProfile,
): ScoringResult {
  // ── Compute signals ──────────────────────────────────────────────────────────
  const businessTypeMatch =
    target.companyType !== null &&
    competitor.companyType !== null &&
    target.companyType.toLowerCase() === competitor.companyType.toLowerCase();

  const industryMatched = industryMatchFn(target.industry, competitor.industry);

  const specialtyJaccard  = jaccardSimilarity(target.primarySpecialties, competitor.primarySpecialties);
  const identitySimScore  = tokenOverlap(
    target.primaryCompetitiveIdentity ?? '',
    competitor.primaryCompetitiveIdentity ?? '',
  );
  const audienceJaccard   = jaccardSimilarity(target.targetAudience, competitor.targetAudience);
  const serviceJaccard    = jaccardSimilarity(target.coreServices, competitor.coreServices);

  // ── Weighted sum → 0–100 score ───────────────────────────────────────────────
  const rawScore =
    specialtyJaccard  * WEIGHTS.specialtyOverlap +
    identitySimScore  * WEIGHTS.identitySimilarity +
    (businessTypeMatch ? WEIGHTS.businessTypeMatch : 0) +
    (industryMatched   ? WEIGHTS.industryMatch     : 0) +
    audienceJaccard   * WEIGHTS.audienceOverlap +
    serviceJaccard    * WEIGHTS.serviceOverlap;

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
    industryMatch:       industryMatched,
    specialtyOverlap:   round2(specialtyJaccard),
    audienceOverlap:    round2(audienceJaccard),
    serviceOverlap:     round2(serviceJaccard),
    identitySimilarity: round2(identitySimScore),
  };

  const scoringReasoning = buildReasoning(target, competitor, matchedSignals);

  return {
    domain:          competitor.domain,
    profile:         competitor,
    relevanceScore,
    scoreConfidence,
    matchedSignals,
    scoringReasoning,
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
): string[] {
  const reasons: string[] = [];

  // Lead with the strongest signal
  if (signals.specialtyOverlap >= 0.6) {
    const shared = sharedTokens(target.primarySpecialties, competitor.primarySpecialties);
    reasons.push(`strong specialty overlap (${pct(signals.specialtyOverlap)})${shared.length ? ': ' + shared.slice(0, 3).join(', ') : ''}`);
  } else if (signals.specialtyOverlap >= 0.2) {
    const shared = sharedTokens(target.primarySpecialties, competitor.primarySpecialties);
    reasons.push(`partial specialty overlap (${pct(signals.specialtyOverlap)})${shared.length ? ': ' + shared.slice(0, 2).join(', ') : ''}`);
  }

  if (signals.identitySimilarity >= 0.5) {
    const identity = competitor.primaryCompetitiveIdentity ?? '';
    reasons.push(`similar competitive identity (${pct(signals.identitySimilarity)})${identity ? ': ' + identity : ''}`);
  } else if (signals.identitySimilarity >= 0.25) {
    reasons.push(`partial identity overlap (${pct(signals.identitySimilarity)})`);
  }

  if (signals.businessTypeMatch && target.companyType) {
    reasons.push(`same company type: ${target.companyType}`);
  }
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
