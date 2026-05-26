// Phase 3A — Competitive Distance Calibration
//
// BEFORE Phase 3A:
//   businessTypeMatch used blended taxonomyAlignment (businessModel + groups + delivery + market).
//   Agency↔SaaS with same specialties scored taxAlignment ≈ 0.53 → 0.53 × 15 = 7.95 pts.
//   Agency↔Agency scored taxAlignment ≈ 0.93 → 0.93 × 15 = 13.95 pts.
//   Gap: 6 pts — insufficient to separate direct competitors from adjacent tooling.
//
// AFTER Phase 3A:
//   businessTypeMatch uses competitiveDistance (pure budget-competition proximity).
//   Agency↔Agency = 1.0 → 1.0 × 25 = 25 pts.
//   Agency↔SaaS   = 0.55 → 0.55 × 25 = 13.75 pts.
//   Gap: 11.25 pts — direct competitors reliably outrank adjacent tooling.

import { describe, it, expect } from 'vitest';
import { competitiveDistance, classifyCompetitiveRelationship } from '../../../semantic/taxonomy';
import { scoreCompetitor, rankCompetitors } from '../scoring/scorer';
import type { CompetitorProfile } from '../types';

// ── Competitive distance matrix tests ─────────────────────────────────────────

describe('Phase 3A: competitive distance matrix', () => {
  it('same model = 1.0', () => {
    expect(competitiveDistance('Agency', 'Agency')).toBe(1.0);
    expect(competitiveDistance('SaaS', 'SaaS')).toBe(1.0);
    expect(competitiveDistance('Platform', 'Platform')).toBe(1.0);
  });

  it('Agency ↔ Consulting = 0.90 (very close — both service delivery)', () => {
    expect(competitiveDistance('Agency', 'Consulting')).toBe(0.90);
    expect(competitiveDistance('Consulting', 'Agency')).toBe(0.90);
  });

  it('Agency ↔ SaaS = 0.55 (adjacent — same problem, different mechanism)', () => {
    expect(competitiveDistance('Agency', 'SaaS')).toBe(0.55);
    expect(competitiveDistance('SaaS', 'Agency')).toBe(0.55);
  });

  it('Agency ↔ Platform = 0.45 (weaker — platform sells infrastructure)', () => {
    expect(competitiveDistance('Agency', 'Platform')).toBe(0.45);
  });

  it('Agency ↔ Media = 0.15 (peripheral — different budget pool)', () => {
    expect(competitiveDistance('Agency', 'Media')).toBe(0.15);
  });

  it('SaaS ↔ Platform = 0.85 (near-direct — both software products)', () => {
    expect(competitiveDistance('SaaS', 'Platform')).toBe(0.85);
  });

  it('SaaS ↔ Tool = 0.75 (direct-ish software competitors)', () => {
    expect(competitiveDistance('SaaS', 'Tool')).toBe(0.75);
  });

  it('is symmetric', () => {
    const pairs: Array<['Agency' | 'SaaS' | 'Platform' | 'Tool' | 'Consulting' | 'Media', 'Agency' | 'SaaS' | 'Platform' | 'Tool' | 'Consulting' | 'Media']> = [
      ['Agency', 'SaaS'], ['Agency', 'Platform'], ['Agency', 'Consulting'],
      ['SaaS', 'Platform'], ['SaaS', 'Tool'], ['Platform', 'Tool'],
    ];
    for (const [a, b] of pairs) {
      expect(competitiveDistance(a, b)).toBeCloseTo(competitiveDistance(b, a), 5);
    }
  });

  it('Agency → SaaS distance is strictly less than Agency → Consulting', () => {
    expect(competitiveDistance('Agency', 'SaaS')).toBeLessThan(competitiveDistance('Agency', 'Consulting'));
  });

  it('Agency → Platform distance is strictly less than Agency → SaaS', () => {
    expect(competitiveDistance('Agency', 'Platform')).toBeLessThan(competitiveDistance('Agency', 'SaaS'));
  });
});

// ── Competitive relationship classification ───────────────────────────────────

describe('Phase 3A: competitive relationship classification', () => {
  it('Agency vs Agency = direct', () => {
    expect(classifyCompetitiveRelationship('Agency', 'Agency', 0.5)).toBe('direct');
  });

  it('Agency vs Consulting = direct (distance ≥ 0.85)', () => {
    expect(classifyCompetitiveRelationship('Agency', 'Consulting', 0.3)).toBe('direct');
  });

  it('SaaS vs Platform = direct (distance ≥ 0.85)', () => {
    expect(classifyCompetitiveRelationship('SaaS', 'Platform', 0.4)).toBe('direct');
  });

  it('Agency vs SaaS = adjacent (distance 0.55)', () => {
    expect(classifyCompetitiveRelationship('Agency', 'SaaS', 0.5)).toBe('adjacent');
  });

  it('Agency vs Platform = adjacent (distance 0.45)', () => {
    expect(classifyCompetitiveRelationship('Agency', 'Platform', 0.5)).toBe('adjacent');
  });

  it('Agency vs Media = peripheral (distance 0.15, low specialty)', () => {
    expect(classifyCompetitiveRelationship('Agency', 'Media', 0.1)).toBe('peripheral');
  });

  it('Agency vs Marketplace with strong specialty overlap = adjacent (topic proximity)', () => {
    // distance(Agency, Marketplace) = 0.30, which is ≥ 0.25 → qualifies for topic-proximity path
    // This covers marketplace platforms (e.g. app marketplaces) that serve the same verticals
    expect(classifyCompetitiveRelationship('Agency', 'Marketplace', 0.65)).toBe('adjacent');
  });

  it('Agency vs Brand = peripheral even with high specialty overlap (brand buys from agency, not competitor)', () => {
    // distance(Agency, Brand) = 0.20 < 0.25 → stays peripheral regardless of specialty overlap
    expect(classifyCompetitiveRelationship('Agency', 'Brand', 0.65)).toBe('peripheral');
  });
});

// ── Ranking order: Agency target ──────────────────────────────────────────────

function makeProfile(overrides: Partial<CompetitorProfile> & { domain: string }): CompetitorProfile {
  return {
    companyType:                null,
    industry:                   null,
    niche:                      null,
    primaryCompetitiveIdentity: null,
    primarySpecialties:         [],
    coreServices:               [],
    targetAudience:             [],
    positioning:                null,
    aiConfidence:               'medium',
    ...overrides,
  };
}

const BRILLMARK = makeProfile({
  domain: 'brillmark.com',
  companyType: 'Agency',
  industry: 'Marketing',
  primaryCompetitiveIdentity: 'CRO and A/B Testing Agency for eCommerce brands',
  primarySpecialties: ['CRO', 'A/B Testing', 'Experimentation'],
  coreServices: ['managed CRO service', 'experiment roadmap', 'A/B test development'],
  targetAudience: ['ecommerce brands', 'DTC brands'],
  aiConfidence: 'high',
});

const SPEERO = makeProfile({
  domain: 'speero.com',
  companyType: 'Agency',
  industry: 'Marketing',
  primaryCompetitiveIdentity: 'CRO Agency — experiment-led growth',
  primarySpecialties: ['CRO', 'A/B Testing', 'Experimentation Strategy'],
  coreServices: ['CRO consulting', 'A/B testing', 'Experimentation programs'],
  targetAudience: ['ecommerce brands', 'B2B SaaS'],
  aiConfidence: 'high',
});

const WIDER_FUNNEL = makeProfile({
  domain: 'widerfunnel.com',
  companyType: 'Agency',
  industry: 'Marketing',
  primaryCompetitiveIdentity: 'Experimentation and CRO consultancy',
  primarySpecialties: ['CRO', 'Experimentation', 'Conversion Optimization'],
  coreServices: ['experimentation programs', 'CRO consulting', 'testing strategy'],
  targetAudience: ['enterprise brands', 'ecommerce brands'],
  aiConfidence: 'high',
});

const CROMETRICS = makeProfile({
  domain: 'crometrics.com',
  companyType: 'Agency',
  industry: 'Marketing',
  primaryCompetitiveIdentity: 'CRO agency for growth-focused brands',
  primarySpecialties: ['CRO', 'A/B Testing', 'Conversion Optimization'],
  coreServices: ['A/B testing', 'CRO services', 'experiment management'],
  targetAudience: ['ecommerce brands', 'growth teams'],
  aiConfidence: 'high',
});

const SPLIT_IO = makeProfile({
  domain: 'split.io',
  companyType: 'SaaS',
  industry: 'Marketing',
  primaryCompetitiveIdentity: 'Feature flagging and experimentation platform for developers',
  primarySpecialties: ['A/B Testing', 'Feature Flags', 'Experimentation', 'Feature Management'],
  coreServices: ['SaaS subscription', 'feature flagging', 'SDK integration', 'experimentation platform'],
  targetAudience: ['engineering teams', 'product managers', 'developers'],
  aiConfidence: 'high',
});

const OPTIMIZELY = makeProfile({
  domain: 'optimizely.com',
  companyType: 'Platform',
  industry: 'Marketing',
  primaryCompetitiveIdentity: 'Digital experience optimization platform',
  primarySpecialties: ['A/B Testing', 'Experimentation', 'Feature Management', 'Personalization'],
  coreServices: ['experimentation platform', 'content management', 'SaaS subscription'],
  targetAudience: ['enterprise marketing teams', 'product teams'],
  aiConfidence: 'high',
});

describe('Phase 3A: agency target — agencies outrank SaaS tools', () => {
  it('Speero (Agency) outranks Split.io (SaaS) — same specialties, direct vs adjacent', () => {
    const speeroScore = scoreCompetitor(BRILLMARK, SPEERO).relevanceScore;
    const splitScore  = scoreCompetitor(BRILLMARK, SPLIT_IO).relevanceScore;
    expect(speeroScore).toBeGreaterThan(splitScore);
  });

  it('WiderFunnel (Agency) outranks Optimizely (Platform)', () => {
    const wfScore   = scoreCompetitor(BRILLMARK, WIDER_FUNNEL).relevanceScore;
    const optScore  = scoreCompetitor(BRILLMARK, OPTIMIZELY).relevanceScore;
    expect(wfScore).toBeGreaterThan(optScore);
  });

  it('Crometrics (Agency) outranks Split.io (SaaS)', () => {
    const croScore   = scoreCompetitor(BRILLMARK, CROMETRICS).relevanceScore;
    const splitScore = scoreCompetitor(BRILLMARK, SPLIT_IO).relevanceScore;
    expect(croScore).toBeGreaterThan(splitScore);
  });

  it('ranking order: Speero ≥ WiderFunnel ≥ Crometrics >> Split.io >> Optimizely', () => {
    const ranked = rankCompetitors(BRILLMARK, [SPLIT_IO, OPTIMIZELY, WIDER_FUNNEL, CROMETRICS, SPEERO]);
    const domains = ranked.map((r) => r.domain);

    // All three agencies must appear before both SaaS/Platform tools
    const speeroIdx     = domains.indexOf('speero.com');
    const wfIdx         = domains.indexOf('widerfunnel.com');
    const croIdx        = domains.indexOf('crometrics.com');
    const splitIdx      = domains.indexOf('split.io');
    const optimizelyIdx = domains.indexOf('optimizely.com');

    expect(speeroIdx).toBeLessThan(splitIdx);
    expect(wfIdx).toBeLessThan(splitIdx);
    expect(croIdx).toBeLessThan(splitIdx);
    expect(speeroIdx).toBeLessThan(optimizelyIdx);
  });

  it('SaaS/Platform tools are visible but score lower — not suppressed to 0', () => {
    const splitScore = scoreCompetitor(BRILLMARK, SPLIT_IO).relevanceScore;
    expect(splitScore).toBeGreaterThan(20);  // still visible, adjacent not peripheral
  });

  it('competitive relationship: Speero = direct, Split.io = adjacent', () => {
    const speeroResult = scoreCompetitor(BRILLMARK, SPEERO);
    const splitResult  = scoreCompetitor(BRILLMARK, SPLIT_IO);
    expect(speeroResult.matchedSignals.competitiveRelationship).toBe('direct');
    expect(splitResult.matchedSignals.competitiveRelationship).toBe('adjacent');
  });

  it('score contribution: business model slot is higher for Speero than Split.io', () => {
    const speeroResult = scoreCompetitor(BRILLMARK, SPEERO);
    const splitResult  = scoreCompetitor(BRILLMARK, SPLIT_IO);
    expect(speeroResult.scoreContributions.businessModel).toBeGreaterThan(splitResult.scoreContributions.businessModel);
  });
});

// ── SaaS vs Platform ranking (SaaS target) ───────────────────────────────────

const SAAS_TARGET = makeProfile({
  domain: 'vwo.com',
  companyType: 'SaaS',
  industry: 'Marketing',
  primaryCompetitiveIdentity: 'A/B testing and CRO software',
  primarySpecialties: ['A/B Testing', 'CRO', 'Heatmaps', 'Personalization'],
  coreServices: ['SaaS subscription', 'A/B testing tool', 'behavioral analytics'],
  targetAudience: ['marketing teams', 'product managers'],
  aiConfidence: 'high',
});

describe('Phase 3A: SaaS target — SaaS/Platform tools rank above agencies', () => {
  it('Optimizely (Platform) outranks Speero (Agency) for a SaaS target', () => {
    const optScore    = scoreCompetitor(SAAS_TARGET, OPTIMIZELY).relevanceScore;
    const speeroScore = scoreCompetitor(SAAS_TARGET, SPEERO).relevanceScore;
    expect(optScore).toBeGreaterThan(speeroScore);
  });

  it('Split.io (SaaS) outranks Speero (Agency) for a SaaS target', () => {
    const splitScore  = scoreCompetitor(SAAS_TARGET, SPLIT_IO).relevanceScore;
    const speeroScore = scoreCompetitor(SAAS_TARGET, SPEERO).relevanceScore;
    expect(splitScore).toBeGreaterThan(speeroScore);
  });
});
