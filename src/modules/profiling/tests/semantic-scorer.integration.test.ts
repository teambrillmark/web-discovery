// Integration tests validating the semantic intelligence layer as wired into the scorer.
//
// Each test section covers a specific semantic correctness property introduced in
// Phase 1 — Semantic Intelligence Stabilization:
//
//   1. CRO ≠ Experimentation (cross-cluster collapse removed)
//   2. "Analytics" bare word maps to ANALYTICS group (ontology gap fixed)
//   3. Jaccard fallback fires for unrecognised specialties
//   4. Full scorer rankings reflect semantic distances, not token identity

import { describe, it, expect } from 'vitest';
import { semanticSpecialtyOverlap } from '../../../semantic/semantic-matcher';
import { mapToSemanticGroups } from '../../../semantic/ontology';
import { scoreCompetitor } from '../scoring/scorer';
import type { CompetitorProfile } from '../types';

// ── Shared profile factory ────────────────────────────────────────────────────

function makeProfile(overrides: Partial<CompetitorProfile>): CompetitorProfile {
  return {
    domain:                     'test.com',
    companyType:                'Agency',
    industry:                   'Marketing',
    niche:                      null,
    primaryCompetitiveIdentity: null,
    primarySpecialties:         [],
    coreServices:               [],
    targetAudience:             [],
    positioning:                null,
    aiConfidence:               'high',
    ...overrides,
  };
}

// ── 1. Cross-cluster collapse removed: CRO ≠ Experimentation ─────────────────
//
// Before fix: 'cro' → 'abtesting' token collapse gave specialtyOverlap = 1.0
// After fix:  CRO and EXPERIMENTATION are distinct groups connected via ontology
//             similarity (0.75), so semantic score = 0.75 (not 1.0)

describe('semantic: CRO and Experimentation are distinct groups (not collapsed)', () => {
  it('CRO specialty → CRO group, not EXPERIMENTATION', () => {
    const groups = mapToSemanticGroups(['Conversion Rate Optimization']);
    expect(groups).toContain('CRO');
    expect(groups).not.toContain('EXPERIMENTATION');
  });

  it('Experimentation specialty → EXPERIMENTATION group, not CRO', () => {
    const groups = mapToSemanticGroups(['A/B Testing', 'Experimentation']);
    expect(groups).toContain('EXPERIMENTATION');
    expect(groups).not.toContain('CRO');
  });

  it('semantic overlap between CRO and Experimentation is 0.75 (related but not identical)', () => {
    const result = semanticSpecialtyOverlap(
      ['A/B Testing', 'Experimentation'],
      ['Conversion Rate Optimization', 'CRO'],
    );
    expect(result.score).toBeCloseTo(0.75, 1);
    expect(result.score).toBeLessThan(1.0);
    expect(result.usedFallback).toBe(false);
  });

  it('identical CRO specialties produce semantic overlap = 1.0', () => {
    const result = semanticSpecialtyOverlap(
      ['Conversion Rate Optimization', 'CRO'],
      ['CRO', 'Landing Page Optimization'],
    );
    expect(result.score).toBe(1.0);
    expect(result.directGroups).toContain('CRO');
  });

  it('scorer: CRO Agency vs Experimentation Agency is similar but not identical', () => {
    const croAgency = makeProfile({ primarySpecialties: ['CRO', 'Conversion Rate Optimization'] });
    const expAgency = makeProfile({ primarySpecialties: ['A/B Testing', 'Experimentation'] });
    const exactMatch = makeProfile({ primarySpecialties: ['A/B Testing', 'Experimentation'] });

    const resultCroPair = scoreCompetitor(expAgency, croAgency);
    const resultExactPair = scoreCompetitor(expAgency, exactMatch);

    // Exact same groups → higher score
    expect(resultExactPair.relevanceScore).toBeGreaterThan(resultCroPair.relevanceScore);
    // CRO Agency is still a meaningful partial match (not treated as unrelated)
    expect(resultCroPair.matchedSignals.specialtyOverlap).toBeGreaterThan(0.5);
  });
});

// ── 2. "Analytics" bare word maps to ANALYTICS group ─────────────────────────
//
// The profiling AI prompt instructs models to use "Analytics" (bare) as the
// canonical specialty. Before fix: 'analytics' didn't match any ontology synonym
// (all had compound forms like 'web analytics', 'product analytics').
// After fix: 'analytics' is the first synonym in the ANALYTICS group.

describe('semantic: bare "Analytics" maps to ANALYTICS group', () => {
  it('"Analytics" as specialty string maps to ANALYTICS', () => {
    const groups = mapToSemanticGroups(['Analytics']);
    expect(groups).toContain('ANALYTICS');
  });

  it('"analytics" lowercase also maps to ANALYTICS', () => {
    expect(mapToSemanticGroups(['analytics'])).toContain('ANALYTICS');
  });

  it('compound forms still map ("Web Analytics", "Product Analytics")', () => {
    expect(mapToSemanticGroups(['Web Analytics'])).toContain('ANALYTICS');
    expect(mapToSemanticGroups(['Product Analytics'])).toContain('ANALYTICS');
  });

  it('Analytics company vs Experimentation target gets semantic partial credit', () => {
    // ANALYTICS ↔ EXPERIMENTATION = 0.35 (related via data-driven culture)
    const result = semanticSpecialtyOverlap(
      ['A/B Testing', 'Experimentation'],
      ['Analytics', 'Data Science'],
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(0.75);
    expect(result.usedFallback).toBe(false);
  });
});

// ── 3. Jaccard fallback for unrecognised specialties ─────────────────────────
//
// When specialties don't map to any of the 13 ontology groups (e.g. "plumbing
// services", a domain outside B2B marketing), the matcher falls back to token
// Jaccard and flags usedFallback=true.

describe('semantic: Jaccard fallback for unrecognised specialties', () => {
  it('unrecognised specialties trigger fallback (usedFallback=true)', () => {
    const result = semanticSpecialtyOverlap(
      ['plumbing installation', 'pipe fitting'],
      ['hvac installation', 'ventilation systems'],
    );
    expect(result.usedFallback).toBe(true);
    expect(result.targetGroups).toHaveLength(0);
    expect(result.competitorGroups).toHaveLength(0);
  });

  it('fallback score is non-zero when tokens overlap', () => {
    const result = semanticSpecialtyOverlap(
      ['civil engineering consulting', 'structural design'],
      ['civil engineering projects', 'structural assessment'],
    );
    expect(result.usedFallback).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('fallback score is 0 for completely different unrecognised specialties', () => {
    const result = semanticSpecialtyOverlap(
      ['plumbing installation'],
      ['dentistry practice management'],
    );
    expect(result.usedFallback).toBe(true);
    expect(result.score).toBe(0);
  });

  it('exposes targetGroups and competitorGroups on successful ontology match', () => {
    const result = semanticSpecialtyOverlap(
      ['A/B Testing'],
      ['Conversion Rate Optimization'],
    );
    expect(result.usedFallback).toBe(false);
    expect(result.targetGroups).toContain('EXPERIMENTATION');
    expect(result.competitorGroups).toContain('CRO');
  });
});

// ── 4. Semantic distance ordering ────────────────────────────────────────────
//
// The scorer should now reflect ontology-aware distances:
//   CRO Agency vs Experimentation target  > SEO Agency vs Experimentation target
//   (CRO ↔ EXPERIMENTATION = 0.75)          (SEO has no direct relation to EXPERIMENTATION)

describe('semantic: scorer produces ontology-aware distance ordering', () => {
  const experimentationTarget = makeProfile({
    domain: 'target.com',
    companyType: 'Agency',
    primarySpecialties: ['A/B Testing', 'Experimentation'],
    primaryCompetitiveIdentity: 'Experimentation Agency',
  });

  it('CRO Agency scores higher than SEO Agency against an Experimentation target', () => {
    const croAgency = makeProfile({
      domain: 'cro.com',
      companyType: 'Agency',
      primarySpecialties: ['Conversion Rate Optimization', 'CRO'],
    });
    const seoAgency = makeProfile({
      domain: 'seo.com',
      companyType: 'Agency',
      primarySpecialties: ['Search Engine Optimization', 'SEO'],
    });

    const croScore = scoreCompetitor(experimentationTarget, croAgency).relevanceScore;
    const seoScore = scoreCompetitor(experimentationTarget, seoAgency).relevanceScore;

    expect(croScore).toBeGreaterThan(seoScore);
  });

  it('Personalization Agency scores between CRO and SEO (partial relatedness)', () => {
    const croAgency = makeProfile({
      domain: 'cro.com',
      companyType: 'Agency',
      primarySpecialties: ['Conversion Rate Optimization', 'CRO'],
    });
    const personalizationAgency = makeProfile({
      domain: 'personal.com',
      companyType: 'Agency',
      primarySpecialties: ['Website Personalization', 'Personalization'],
    });
    const seoAgency = makeProfile({
      domain: 'seo.com',
      companyType: 'Agency',
      primarySpecialties: ['Search Engine Optimization', 'SEO'],
    });

    const croScore   = scoreCompetitor(experimentationTarget, croAgency).relevanceScore;
    const persoScore = scoreCompetitor(experimentationTarget, personalizationAgency).relevanceScore;
    const seoScore   = scoreCompetitor(experimentationTarget, seoAgency).relevanceScore;

    // EXPERIMENTATION ↔ CRO = 0.75 > EXPERIMENTATION ↔ PERSONALIZATION = 0.50 > SEO = 0
    expect(croScore).toBeGreaterThan(persoScore);
    expect(persoScore).toBeGreaterThan(seoScore);
  });

  it('specialtyOverlap in matchedSignals reflects semantic score (not raw Jaccard)', () => {
    // CRO and Experimentation share zero tokens but are semantically related (0.75)
    const croAgency = makeProfile({
      domain: 'cro.com',
      companyType: 'Agency',
      primarySpecialties: ['Conversion Rate Optimization'],
    });
    const result = scoreCompetitor(experimentationTarget, croAgency);
    // With Jaccard this would be 0 (no shared tokens after removing cross-cluster collapse)
    // With semantic scoring this should be 0.75
    expect(result.matchedSignals.specialtyOverlap).toBeCloseTo(0.75, 1);
  });
});
