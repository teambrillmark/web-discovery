// Lightweight candidate filter — runs BEFORE qualification and deep profiling.
//
// WHY this exists:
//   Discovery providers return 20–40 raw domains per run. Many come from listicle
//   pages where words like "testing" match SEO context (QA companies) rather than
//   competitive context (A/B testing agencies). Routing all of them through:
//     • Groq qualification  (AI batch call)
//     • Groq profiling      (another AI batch call, up to 20 domains per request)
//   wastes tokens and latency on candidates with zero semantic overlap with the target.
//
// HOW it works — two cheap signals:
//
//   1. Source signal:
//      Groq AI discovery explicitly uses the business context to enumerate competitors,
//      so its output is pre-filtered. Groq domains always pass.
//      AlternativeTo (stub-search) is a curated product catalog — also trusted.
//      Listicle extraction is noisiest: needs corroborating domain evidence.
//
//   2. Domain keyword signal:
//      The domain slug is checked for substring / exact-word matches against a
//      keyword set derived from the target's specialties, niche, and identity.
//      This catches obvious relevance clues:
//        "cro"         in "invespcro.com"           → CRO agency
//        "conversion"  in "conversionsciences.com"  → conversion agency
//        "testing"     in "abtesting-platform.io"   → A/B testing SaaS
//      Short industry acronyms (cro, seo, ppc…) get special treatment: they are
//      matched as exact slug-words OR substrings, because they are unambiguous even
//      embedded in a larger slug. Generic short words ("test", 4 chars) are excluded
//      from the keyword set (min 5 chars for raw tokens) to avoid false positives
//      from QA-testing companies whose domain contains "test".
//
// SCORING:
//   groq           → 30  (always above PASS_THRESHOLD of 10)
//   stub-search    → 15  (always passes)
//   listicle       →  5  (base) + up to 20 (keyword bonus) = 25 max
//   Threshold: 10. Listicle domains without any keyword signal score 5 → filtered.
//
// SAFETY FLOOR:
//   If fewer than MIN_PROFILING_CANDIDATES pass (e.g. sparse discovery), the
//   highest-scoring filtered candidates are rescued to ensure the profiler has
//   enough input to produce a meaningful ranking.

import type { Logger } from '../../../lib/logger';
import type { ProfilingTargetContext } from '../types';
import { tokenize, normalizeText } from '../scoring/comparator';

// ── Input / output types ─────────────────────────────────────────────────────

// Matches DiscoveredCompetitor from discovery/types without importing it
// (avoids a circular module dependency: profiling ← discovery ← result-collector)
export interface FilterCandidate {
  domain: string;
  source: string;
  discoveryMethod: string;
  queryId: string;
  discoveredAt: string;
}

export interface FilteredOut extends FilterCandidate {
  filterScore: number;
  filterReason: string;
}

export interface CandidateFilterStats {
  totalInput: number;
  passed: number;
  filtered: number;
  filterRate: number;       // 0–100 percentage
  keywordsUsed: number;     // how many domain keywords were extracted
}

export interface CandidateFilterResult {
  passed: FilterCandidate[];
  filteredOut: FilteredOut[];
  stats: CandidateFilterStats;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PASS_THRESHOLD = 10;
const MIN_PROFILING_CANDIDATES = 8;

// Source trust scores — higher means more signal even without domain evidence.
const SOURCE_SCORE: Record<string, number> = {
  'groq':                  30,  // always > PASS_THRESHOLD — context-aware AI enumeration
  'stub-search':           15,  // always > PASS_THRESHOLD — curated product catalog
  'listicle-extraction':    5,  // below threshold alone — needs keyword corroboration
};

// 3-char industry acronyms commonly embedded in domain names (e.g. "invespcro").
// These are specific enough to be meaningful even as substrings; unlike "test"
// (which matches QA companies), "cro" / "seo" / "ppc" unambiguously signal niche.
const INDUSTRY_ACRONYMS = new Set(['cro', 'seo', 'ppc', 'cta', 'ux', 'cx', 'mvt', 'abt']);

// ── CandidateFilter ──────────────────────────────────────────────────────────

export class CandidateFilter {
  constructor(private readonly logger: Logger) {}

  filter(
    candidates: FilterCandidate[],
    targetContext: ProfilingTargetContext | undefined,
  ): CandidateFilterResult {
    // Without a target context we cannot compute keyword signal — pass everything.
    if (!targetContext || candidates.length === 0) {
      return {
        passed: candidates,
        filteredOut: [],
        stats: {
          totalInput: candidates.length, passed: candidates.length,
          filtered: 0, filterRate: 0, keywordsUsed: 0,
        },
      };
    }

    const keywords = extractDomainKeywords(targetContext);

    this.logger.debug(
      { keywordCount: keywords.length, sample: keywords.slice(0, 8), queryId: candidates[0]?.queryId },
      'CandidateFilter: keyword set built',
    );

    const passed: FilterCandidate[] = [];
    const filteredOut: FilteredOut[] = [];

    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, keywords);

      if (score >= PASS_THRESHOLD) {
        passed.push(candidate);
        this.logger.debug(
          { domain: candidate.domain, source: candidate.source, filterScore: score },
          'CandidateFilter: passed',
        );
      } else {
        filteredOut.push({ ...candidate, filterScore: score, filterReason: 'no-domain-signal' });
        this.logger.debug(
          { domain: candidate.domain, source: candidate.source, filterScore: score },
          'CandidateFilter: filtered — no domain-keyword signal',
        );
      }
    }

    // Safety floor: if very few candidates passed (sparse discovery or very niche target),
    // rescue the highest-scoring filtered candidates so the profiler has enough input.
    if (passed.length < MIN_PROFILING_CANDIDATES && filteredOut.length > 0) {
      const needed = MIN_PROFILING_CANDIDATES - passed.length;
      const rescued = filteredOut
        .slice()
        .sort((a, b) => b.filterScore - a.filterScore)
        .slice(0, needed);

      for (const r of rescued) {
        const idx = filteredOut.indexOf(r);
        if (idx !== -1) filteredOut.splice(idx, 1);
        const { filterScore: _s, filterReason: _r, ...candidate } = r;
        passed.push(candidate);
      }

      this.logger.debug(
        { rescued: rescued.length, queryId: candidates[0]?.queryId },
        'CandidateFilter: rescued candidates to meet minimum floor',
      );
    }

    const stats: CandidateFilterStats = {
      totalInput:   candidates.length,
      passed:       passed.length,
      filtered:     filteredOut.length,
      filterRate:   candidates.length > 0 ? Math.round((filteredOut.length / candidates.length) * 100) : 0,
      keywordsUsed: keywords.length,
    };

    this.logger.info(
      { ...stats, queryId: candidates[0]?.queryId },
      'CandidateFilter: complete',
    );

    return { passed, filteredOut, stats };
  }
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreCandidate(candidate: FilterCandidate, keywords: string[]): number {
  const sourceScore = SOURCE_SCORE[candidate.source] ?? 5;

  // Trusted sources pass without keyword check — no need to spend time on it.
  if (sourceScore >= PASS_THRESHOLD) return sourceScore;

  // Domain keyword signal for untrusted sources (listicle).
  const slug = domainSlug(candidate.domain);
  const parts = slug.split('-');    // hyphenated slugs, e.g. "cro-agency" → ["cro", "agency"]

  let bonus = 0;
  for (const kw of keywords) {
    // Exact word match in hyphenated parts (highest confidence)
    if (parts.includes(kw)) {
      bonus = 20;
      break;
    }
    // Substring in combined slug (e.g. "cro" in "invespcro")
    if (slug.includes(kw)) {
      bonus = Math.max(bonus, 10);
    }
  }

  return sourceScore + bonus;
}

// ── Keyword extraction ────────────────────────────────────────────────────────

function extractDomainKeywords(ctx: ProfilingTargetContext): string[] {
  const kws = new Set<string>();

  // Primary semantic fields — the strongest signal for what the target competes on.
  const semanticFields = [
    ...(ctx.primarySpecialties ?? []),
    ctx.primaryCompetitiveIdentity ?? '',
    ctx.niche ?? '',
  ];

  for (const field of semanticFields) {
    // Canonical tokens (post-normalization): e.g. "Experimentation" → "abtesting"
    // Min 4 chars — short canonical tokens like "ux" are handled via INDUSTRY_ACRONYMS.
    for (const t of tokenize(normalizeText(field))) {
      if (t.length >= 4) kws.add(t);
    }

    // Raw tokens (pre-normalization): e.g. "conversion", "testing", "experimentation"
    // Min 5 chars to exclude "test" (4 chars) which matches QA companies, not A/B testing.
    for (const t of tokenize(field)) {
      if (t.length >= 5) kws.add(t);

      // Short industry acronyms: specific enough to be used even as substring matches.
      if (INDUSTRY_ACRONYMS.has(t)) kws.add(t);
    }
  }

  // Broaden with core services (min 5 chars only — services are noisier)
  for (const svc of ctx.coreServices ?? []) {
    for (const t of tokenize(svc)) {
      if (t.length >= 5) kws.add(t);
      if (INDUSTRY_ACRONYMS.has(t)) kws.add(t);
    }
  }

  return [...kws];
}

// Strips TLD(s) and www prefix, lowercases the result.
// Handles: .com, .io, .co.za, .net, .store, .tech, etc.
function domainSlug(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.[a-z]{2,4}(\.[a-z]{2})?$/, '');
}
