// Phase 3 — Taxonomy Propagation
// These tests verify that BusinessModel survives from scorer output through to
// the ScoringResult (the last structured layer before persistence/API).
//
// BEFORE Phase 3: BusinessModel was computed transiently in scoreCompetitor()
//   and discarded immediately. ScoringResult had no businessModel field.
//
// AFTER Phase 3: ScoringResult.businessModel and .businessModelConfidence are
//   always populated. StoredProfile carries both fields. The raw companyType
//   is preserved alongside the normalized taxonomy for observability.

import { describe, it, expect } from 'vitest';
import { scoreCompetitor } from '../scoring/scorer';
import type { CompetitorProfile } from '../types';

// ── Test fixtures ─────────────────────────────────────────────────────────────

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

const TARGET = makeProfile({
  domain: 'brillmark.com',
  companyType: 'Agency',
  primaryCompetitiveIdentity: 'CRO Agency for eCommerce brands',
  primarySpecialties: ['CRO', 'A/B Testing', 'Experimentation'],
  coreServices: ['managed CRO service', 'experiment roadmap', 'consulting'],
  targetAudience: ['ecommerce brands', 'DTC brands'],
});

// ── Propagation tests ─────────────────────────────────────────────────────────

describe('Phase 3: BusinessModel present on ScoringResult', () => {
  it('ScoringResult has businessModel field (not undefined)', () => {
    const competitor = makeProfile({
      domain: 'vwo.com',
      companyType: 'SaaS',
      primarySpecialties: ['A/B Testing', 'CRO'],
    });
    const result = scoreCompetitor(TARGET, competitor);
    expect(result.businessModel).toBeDefined();
    expect(result.businessModel).not.toBeNull();
  });

  it('ScoringResult has businessModelConfidence with all 9 BusinessModel keys', () => {
    const competitor = makeProfile({
      domain: 'optimizely.com',
      companyType: 'Platform',
      primarySpecialties: ['A/B Testing', 'Feature Flags', 'Experimentation'],
    });
    const result = scoreCompetitor(TARGET, competitor);
    const keys = Object.keys(result.businessModelConfidence);
    // All 9 BusinessModel values must be present
    for (const model of ['Agency', 'Consulting', 'SaaS', 'Platform', 'Tool', 'Marketplace', 'Brand', 'Media', 'Other']) {
      expect(keys).toContain(model);
    }
  });

  it('confidence values sum to 1.0', () => {
    const competitor = makeProfile({
      domain: 'convert.com',
      companyType: 'SaaS',
      primarySpecialties: ['A/B Testing'],
    });
    const result = scoreCompetitor(TARGET, competitor);
    const total = Object.values(result.businessModelConfidence).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0, 1);
  });
});

// ── Vocabulary normalization tests ────────────────────────────────────────────

describe('Phase 3: vocabulary normalized through taxonomy', () => {
  it('companyType "eCommerce" → businessModel "Brand" (not "Other")', () => {
    const competitor = makeProfile({
      domain: 'allbirds.com',
      companyType: 'eCommerce',
    });
    const result = scoreCompetitor(TARGET, competitor);
    expect(result.businessModel).toBe('Brand');
  });

  it('companyType "eCommerce Brand" → businessModel "Brand"', () => {
    const competitor = makeProfile({
      domain: 'gymshark.com',
      companyType: 'eCommerce Brand',
    });
    const result = scoreCompetitor(TARGET, competitor);
    expect(result.businessModel).toBe('Brand');
  });

  it('companyType "Agency" → businessModel "Agency"', () => {
    const competitor = makeProfile({
      domain: 'conversionrate.store',
      companyType: 'Agency',
      primarySpecialties: ['CRO', 'A/B Testing'],
    });
    const result = scoreCompetitor(TARGET, competitor);
    expect(result.businessModel).toBe('Agency');
  });

  it('companyType "SaaS" → businessModel "SaaS"', () => {
    const competitor = makeProfile({
      domain: 'vwo.com',
      companyType: 'SaaS',
      primarySpecialties: ['A/B Testing'],
    });
    const result = scoreCompetitor(TARGET, competitor);
    expect(result.businessModel).toBe('SaaS');
  });

  it('companyType null with SaaS signals → evidence accumulator classifies "SaaS" or "Platform"', () => {
    const competitor = makeProfile({
      domain: 'abtasty.com',
      companyType: null,
      primaryCompetitiveIdentity: 'A/B testing software platform',
      coreServices: ['SaaS subscription', 'software platform', 'API access'],
    });
    const result = scoreCompetitor(TARGET, competitor);
    expect(['SaaS', 'Platform']).toContain(result.businessModel);
    // Must NOT fall to Other when evidence is present
    expect(result.businessModel).not.toBe('Other');
  });
});

// ── Raw companyType preservation tests ───────────────────────────────────────

describe('Phase 3: raw companyType preserved for observability', () => {
  it('profile.companyType is unchanged after scoring', () => {
    const competitor = makeProfile({
      domain: 'splitio.com',
      companyType: 'eCommerce',  // unusual — raw AI string preserved
    });
    const result = scoreCompetitor(TARGET, competitor);
    // Raw AI string must not be modified
    expect(result.profile.companyType).toBe('eCommerce');
    // But normalized taxonomy corrects it
    expect(result.businessModel).toBe('Brand');
  });

  it('profile.companyType null does not cause businessModel to error', () => {
    const competitor = makeProfile({ domain: 'widerfunnel.com', companyType: null });
    expect(() => scoreCompetitor(TARGET, competitor)).not.toThrow();
    const result = scoreCompetitor(TARGET, competitor);
    expect(result.businessModel).toBeDefined();
  });
});

// ── StoredProfile field shape ─────────────────────────────────────────────────

describe('Phase 3: StoredProfile carries taxonomy fields', () => {
  it('ScoringResult fields match StoredProfile interface shape', () => {
    const competitor = makeProfile({
      domain: 'kameleoon.com',
      companyType: 'SaaS',
      primarySpecialties: ['A/B Testing', 'Personalization'],
    });
    const result = scoreCompetitor(TARGET, competitor);

    // These are the fields that profiling.service.ts copies into StoredProfile
    expect(typeof result.businessModel).toBe('string');
    expect(typeof result.businessModelConfidence).toBe('object');
    expect(result.businessModelConfidence['Agency']).toBeGreaterThanOrEqual(0);
  });
});
