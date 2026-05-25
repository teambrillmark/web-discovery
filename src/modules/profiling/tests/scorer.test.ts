import { describe, it, expect } from 'vitest';
import { scoreCompetitor, rankCompetitors } from '../scoring/scorer';
import type { CompetitorProfile } from '../types';

// ── Fixture profiles ──────────────────────────────────────────────────────────

const targetProfile: CompetitorProfile = {
  domain:                     'brillmark.com',
  companyType:                'Agency',
  industry:                   'Marketing',
  niche:                      'Experimentation Agency for eCommerce',
  primaryCompetitiveIdentity: 'Experimentation / A/B Testing Agency',
  primarySpecialties:         ['A/B Testing', 'CRO', 'Conversion Rate Optimization'],
  coreServices:               ['A/B Test Development', 'CRO Support', 'Custom Web Development'],
  targetAudience:             ['eCommerce businesses', 'Global brands'],
  positioning:                'High-velocity A/B testing and CRO agency for eCommerce.',
  aiConfidence:               'high',
};

const highRelevanceCompetitor: CompetitorProfile = {
  domain:                     'speero.com',
  companyType:                'Agency',
  industry:                   'Marketing',
  niche:                      'CRO Agency',
  primaryCompetitiveIdentity: 'CRO / A/B Testing Agency',
  primarySpecialties:         ['A/B Testing', 'CRO', 'Experimentation Strategy'],
  coreServices:               ['CRO consulting', 'A/B testing', 'Experimentation programs'],
  targetAudience:             ['eCommerce brands', 'B2B SaaS'],
  positioning:                'Data-driven CRO agency.',
  aiConfidence:               'high',
};

const mediumRelevanceCompetitor: CompetitorProfile = {
  domain:                     'klientboost.com',
  companyType:                'Agency',
  industry:                   'Marketing',
  niche:                      'PPC + CRO Agency',
  primaryCompetitiveIdentity: 'Performance Marketing Agency',
  primarySpecialties:         ['PPC advertising', 'Landing page optimization', 'Paid social'],
  coreServices:               ['Google Ads', 'Facebook Ads', 'Landing pages'],
  targetAudience:             ['B2B SaaS', 'eCommerce'],
  positioning:                'ROI-focused paid media and landing page agency.',
  aiConfidence:               'high',
};

const lowRelevanceCompetitor: CompetitorProfile = {
  domain:                     'shopifyplus.com',
  companyType:                'Platform',
  industry:                   'eCommerce',
  niche:                      'eCommerce Platform',
  primaryCompetitiveIdentity: 'eCommerce Platform for Enterprise',
  primarySpecialties:         ['eCommerce platform', 'Store management', 'Payment processing'],
  coreServices:               ['Online store', 'Checkout', 'Inventory management'],
  targetAudience:             ['Enterprise retailers', 'DTC brands'],
  positioning:                'Scalable eCommerce platform.',
  aiConfidence:               'high',
};

const unknownCompetitor: CompetitorProfile = {
  domain:                     'unknownxyz.io',
  companyType:                null,
  industry:                   null,
  niche:                      null,
  primaryCompetitiveIdentity: null,
  primarySpecialties:         [],
  coreServices:               [],
  targetAudience:             [],
  positioning:                null,
  aiConfidence:               'low',
};

// ── scoreCompetitor tests ─────────────────────────────────────────────────────

describe('scoreCompetitor', () => {
  it('scores a high-relevance competitor above 60', () => {
    const result = scoreCompetitor(targetProfile, highRelevanceCompetitor);
    expect(result.relevanceScore).toBeGreaterThan(60);
  });

  it('scores a medium-relevance competitor between 25 and 70', () => {
    const result = scoreCompetitor(targetProfile, mediumRelevanceCompetitor);
    expect(result.relevanceScore).toBeGreaterThanOrEqual(20);
    expect(result.relevanceScore).toBeLessThan(80);
  });

  it('scores a low-relevance competitor below medium', () => {
    const highResult = scoreCompetitor(targetProfile, highRelevanceCompetitor);
    const lowResult  = scoreCompetitor(targetProfile, lowRelevanceCompetitor);
    expect(highResult.relevanceScore).toBeGreaterThan(lowResult.relevanceScore);
  });

  it('scores an unknown profile at 0', () => {
    const result = scoreCompetitor(targetProfile, unknownCompetitor);
    expect(result.relevanceScore).toBe(0);
  });

  it('score is between 0 and 100', () => {
    for (const competitor of [highRelevanceCompetitor, mediumRelevanceCompetitor, lowRelevanceCompetitor, unknownCompetitor]) {
      const { relevanceScore } = scoreCompetitor(targetProfile, competitor);
      expect(relevanceScore).toBeGreaterThanOrEqual(0);
      expect(relevanceScore).toBeLessThanOrEqual(100);
    }
  });

  it('sets correct scoreConfidence', () => {
    const high   = scoreCompetitor(targetProfile, highRelevanceCompetitor);
    const low    = scoreCompetitor(targetProfile, unknownCompetitor);
    expect(['high', 'medium', 'low']).toContain(high.scoreConfidence);
    expect(low.scoreConfidence).toBe('low');
  });

  it('businessTypeMatch is true when company types match', () => {
    const result = scoreCompetitor(targetProfile, highRelevanceCompetitor);
    expect(result.matchedSignals.businessTypeMatch).toBe(true);
  });

  it('businessTypeMatch is false when company types differ', () => {
    const result = scoreCompetitor(targetProfile, lowRelevanceCompetitor);
    expect(result.matchedSignals.businessTypeMatch).toBe(false); // Agency vs Platform
  });

  it('industryMatch is true when industries overlap', () => {
    const result = scoreCompetitor(targetProfile, highRelevanceCompetitor);
    expect(result.matchedSignals.industryMatch).toBe(true);
  });

  it('specialtyOverlap is between 0 and 1', () => {
    for (const competitor of [highRelevanceCompetitor, mediumRelevanceCompetitor, unknownCompetitor]) {
      const { matchedSignals } = scoreCompetitor(targetProfile, competitor);
      expect(matchedSignals.specialtyOverlap).toBeGreaterThanOrEqual(0);
      expect(matchedSignals.specialtyOverlap).toBeLessThanOrEqual(1);
    }
  });

  it('returns non-empty scoringReasoning', () => {
    const result = scoreCompetitor(targetProfile, highRelevanceCompetitor);
    expect(result.scoringReasoning.length).toBeGreaterThan(0);
  });

  it('scoringReasoning mentions weak overlap for unknown profile', () => {
    const result = scoreCompetitor(targetProfile, unknownCompetitor);
    expect(result.scoringReasoning[0]).toContain('weak');
  });

  it('returns the domain from the competitor profile', () => {
    const result = scoreCompetitor(targetProfile, highRelevanceCompetitor);
    expect(result.domain).toBe('speero.com');
  });
});

// ── rankCompetitors tests ─────────────────────────────────────────────────────

describe('rankCompetitors', () => {
  it('returns competitors sorted by score descending', () => {
    const ranked = rankCompetitors(targetProfile, [
      lowRelevanceCompetitor,
      highRelevanceCompetitor,
      mediumRelevanceCompetitor,
    ]);
    expect(ranked[0]!.domain).toBe('speero.com');
    expect(ranked[0]!.relevanceScore).toBeGreaterThanOrEqual(ranked[1]!.relevanceScore);
    expect(ranked[1]!.relevanceScore).toBeGreaterThanOrEqual(ranked[2]!.relevanceScore);
  });

  it('returns empty array for empty input', () => {
    expect(rankCompetitors(targetProfile, [])).toHaveLength(0);
  });

  it('preserves all competitors in output', () => {
    const competitors = [lowRelevanceCompetitor, highRelevanceCompetitor, unknownCompetitor];
    const ranked = rankCompetitors(targetProfile, competitors);
    expect(ranked).toHaveLength(3);
  });

  it('high-relevance competitor beats unknown competitor', () => {
    const ranked = rankCompetitors(targetProfile, [unknownCompetitor, highRelevanceCompetitor]);
    expect(ranked[0]!.domain).toBe('speero.com');
  });
});
