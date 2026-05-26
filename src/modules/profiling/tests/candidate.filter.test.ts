import { describe, it, expect, vi } from 'vitest';
import { CandidateFilter } from '../filtering/candidate.filter';
import type { FilterCandidate } from '../filtering/candidate.filter';
import type { ProfilingTargetContext } from '../types';
import type { Logger } from '../../../lib/logger';

const noop = vi.fn();
const logger = {
  info: noop, warn: noop, error: noop, debug: noop, fatal: noop, trace: noop,
  child: () => logger,
} as unknown as Logger;

const filter = new CandidateFilter(logger);

function makeCandidate(domain: string, source = 'listicle-extraction'): FilterCandidate {
  return { domain, source, discoveryMethod: 'listicle', queryId: 'q1', discoveredAt: new Date().toISOString() };
}

// Eight groq candidates that always pass — used to satisfy the safety floor so that
// listicle candidates under test are truly filtered rather than rescued.
const FLOOR_FILLERS = Array.from({ length: 8 }, (_, i) =>
  ({ ...makeCandidate(`filler${i}.com`), source: 'groq' }),
);

const croContext: ProfilingTargetContext = {
  domain: 'brillmark.com',
  companyType: 'agency',
  industry: 'Digital Marketing',
  niche: 'CRO and A/B Testing',
  primaryCompetitiveIdentity: 'CRO and Experimentation Agency',
  primarySpecialties: ['A/B Testing', 'Conversion Rate Optimization', 'Experimentation'],
  coreServices: ['Landing page optimization', 'Split testing'],
  targetAudience: ['eCommerce brands', 'SaaS companies'],
  positioningSummary: 'CRO agency specializing in A/B testing',
  confidence: 'high',
};

describe('CandidateFilter — no context', () => {
  it('passes everything when targetContext is undefined', () => {
    const candidates = [makeCandidate('random.com'), makeCandidate('another.io')];
    const result = filter.filter(candidates, undefined);
    expect(result.passed).toHaveLength(2);
    expect(result.filteredOut).toHaveLength(0);
    expect(result.stats.filterRate).toBe(0);
  });

  it('passes everything for empty candidate list', () => {
    const result = filter.filter([], croContext);
    expect(result.passed).toHaveLength(0);
    expect(result.stats.totalInput).toBe(0);
  });
});

describe('CandidateFilter — source scoring', () => {
  it('groq-sourced domains always pass regardless of domain name', () => {
    const candidate = { ...makeCandidate('unrelated-accounting.com'), source: 'groq' };
    const result = filter.filter([candidate], croContext);
    expect(result.passed).toHaveLength(1);
  });

  it('stub-search domains always pass regardless of domain name', () => {
    const candidate = { ...makeCandidate('nkeywords.net'), source: 'stub-search' };
    const result = filter.filter([candidate], croContext);
    expect(result.passed).toHaveLength(1);
  });

  it('listicle domains without keyword signal are filtered out', () => {
    const candidate = makeCandidate('randomaccounting.com');
    const result = filter.filter([...FLOOR_FILLERS, candidate], croContext);
    expect(result.filteredOut.map((c) => c.domain)).toContain('randomaccounting.com');
  });
});

describe('CandidateFilter — domain keyword matching (CRO context)', () => {
  it('passes a domain with "cro" industry acronym embedded in slug', () => {
    const result = filter.filter([makeCandidate('invespcro.com')], croContext);
    expect(result.passed.map((c) => c.domain)).toContain('invespcro.com');
  });

  it('passes a domain with "conversion" in slug (raw token ≥5 chars)', () => {
    const result = filter.filter([makeCandidate('conversionsciences.com')], croContext);
    expect(result.passed.map((c) => c.domain)).toContain('conversionsciences.com');
  });

  it('passes a domain with "testing" as a hyphenated slug part', () => {
    const result = filter.filter([makeCandidate('ab-testing-agency.com')], croContext);
    expect(result.passed.map((c) => c.domain)).toContain('ab-testing-agency.com');
  });

  it('filters a domain with unrelated keywords (no CRO signal)', () => {
    const result = filter.filter([...FLOOR_FILLERS, makeCandidate('cloudaccounting.io')], croContext);
    expect(result.filteredOut.map((c) => c.domain)).toContain('cloudaccounting.io');
  });

  it('filters a domain with only "test" (4 chars — excluded to avoid QA companies)', () => {
    const result = filter.filter([...FLOOR_FILLERS, makeCandidate('testmatick.com')], croContext);
    expect(result.filteredOut.map((c) => c.domain)).toContain('testmatick.com');
  });
});

describe('CandidateFilter — safety floor', () => {
  it('rescues highest-scoring filtered candidates when passed count is below MIN_PROFILING_CANDIDATES', () => {
    // Provide 3 groq (always pass) + 12 unrelated listicles (all fail).
    // With only 3 passing, floor=8 should rescue 5 more.
    const groqCandidates = ['opt1.com', 'opt2.com', 'opt3.com'].map(
      (d) => ({ ...makeCandidate(d), source: 'groq' }),
    );
    const listicleCandidates = Array.from({ length: 12 }, (_, i) =>
      makeCandidate(`norelevance${i}.com`),
    );
    const result = filter.filter([...groqCandidates, ...listicleCandidates], croContext);
    expect(result.passed.length).toBeGreaterThanOrEqual(8);
  });

  it('does not exceed total candidate count when rescuing', () => {
    const few = [makeCandidate('norelevance1.com'), makeCandidate('norelevance2.com')];
    const result = filter.filter(few, croContext);
    // Both get rescued (total < MIN). All candidates end up in passed.
    expect(result.passed.length).toBe(2);
    expect(result.filteredOut.length).toBe(0);
  });
});

describe('CandidateFilter — stats', () => {
  it('computes filterRate as a percentage', () => {
    const candidates = [
      { ...makeCandidate('opt1.com'), source: 'groq' },
      { ...makeCandidate('opt2.com'), source: 'groq' },
      makeCandidate('norelevance.com'), // filtered (score 5 < 10)
    ];
    // With 3 candidates and 1 filtered (but floor may rescue it), just verify stats structure.
    const result = filter.filter(candidates, croContext);
    expect(result.stats.totalInput).toBe(3);
    expect(result.stats.passed + result.stats.filtered).toBe(3);
    expect(result.stats.filterRate).toBe(Math.round((result.stats.filtered / 3) * 100));
  });

  it('reports keywordsUsed > 0 when context has specialties', () => {
    const result = filter.filter([makeCandidate('any.com')], croContext);
    expect(result.stats.keywordsUsed).toBeGreaterThan(0);
  });
});
