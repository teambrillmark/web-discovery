// Phase 2 — Semantic Hierarchy + Taxonomy Consolidation
// Integration tests validating the four Phase 2 architectural improvements:
//
//   1. Hierarchy preservation: Experimentation ≠ A/B Testing (comparator)
//   2. Ontology hierarchy metadata: parent/child relationships exposed
//   3. Evidence-based classification: multi-source confidence accumulation
//   4. eCommerce companyType gap fixed (inferBusinessModel)

import { describe, it, expect } from 'vitest';
import { normalizeText, tokenOverlap } from '../../modules/profiling/scoring/comparator';
import { DEFAULT_ONTOLOGY, groupRelationship, groupSimilarity } from '../ontology';
import { accumulateTaxonomyEvidence } from '../evidence-classifier';
import { classifyCompanyTaxonomy } from '../taxonomy';

// ── 1. Hierarchy preservation in comparator ───────────────────────────────────
//
// BEFORE Phase 2: 'experimentation' → 'abtesting' → tokenOverlap(Exp Agency, AB Agency) = 1.0
// AFTER  Phase 2: 'experimentation' stays 'experimentation' → overlap = ~0.5 (share "agency")
//
// BEFORE: "A/B Testing & Experimentation" → "abtesting & abtesting" (log shows collapse)
// AFTER:  "A/B Testing & Experimentation" → "abtesting & experimentation" (hierarchy preserved)

describe('Phase 2: semantic hierarchy preserved in comparator', () => {
  it('BEFORE fix: experimentation collapsed to abtesting (regression baseline)', () => {
    // This test documents WRONG behavior that was fixed.
    // normalizeText('Experimentation') should no longer return 'abtesting'.
    const result = normalizeText('Experimentation Agency');
    expect(result).not.toContain('abtesting');
    expect(result.toLowerCase()).toContain('experimentation');
  });

  it('normalizeText preserves experimentation as a distinct canonical token', () => {
    expect(normalizeText('experimentation')).toContain('experimentation');
    expect(normalizeText('Experimentation Strategy')).toContain('experimentation');
    expect(normalizeText('experiments')).toContain('experimentation');
  });

  it('normalizeText still correctly collapses A/B Testing → abtesting', () => {
    expect(normalizeText('A/B Testing')).toContain('abtesting');
    expect(normalizeText('Split Testing')).toContain('abtesting');
  });

  it('tokenOverlap: "Experimentation Agency" vs "A/B Testing Agency" is partial (~0.5)', () => {
    // They share "agency" but differ on concept token → overlap = 1/2 = 0.5
    const result = tokenOverlap('Experimentation Agency', 'A/B Testing Agency');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1.0);
    expect(result).toBeCloseTo(0.5, 1);
  });

  it('tokenOverlap: identical experimentation identities = 1.0', () => {
    expect(tokenOverlap('Experimentation Agency', 'Experimentation Agency')).toBe(1.0);
  });

  it('tokenOverlap: "A/B Testing Agency" vs "A/B Testing Agency" = 1.0', () => {
    expect(tokenOverlap('A/B Testing Agency', 'A/B Testing Agency')).toBe(1.0);
  });

  it('experimentation programs/platform/strategy → experimentation (not abtesting)', () => {
    // modifier words ('programs', 'strategy') are in STOPWORDS — tokenize strips them
    // 'experimentation platform' is the one normalization we added
    expect(normalizeText('experimentation platform')).toContain('experimentation');
    expect(normalizeText('experimentation platform')).not.toContain('abtesting');
  });
});

// ── 2. Ontology hierarchy metadata ────────────────────────────────────────────

describe('Phase 2: ontology hierarchy metadata (parentGroup / childGroups)', () => {
  it('ECOMMERCE_OPTIMIZATION has parentGroup = CRO', () => {
    const group = DEFAULT_ONTOLOGY.find((g) => g.id === 'ECOMMERCE_OPTIMIZATION');
    expect(group?.parentGroup).toBe('CRO');
  });

  it('CRO has ECOMMERCE_OPTIMIZATION in childGroups', () => {
    const group = DEFAULT_ONTOLOGY.find((g) => g.id === 'CRO');
    expect(group?.childGroups).toContain('ECOMMERCE_OPTIMIZATION');
  });

  it('EMAIL_MARKETING and CONTENT_MARKETING have parentGroup = GROWTH_MARKETING', () => {
    const email   = DEFAULT_ONTOLOGY.find((g) => g.id === 'EMAIL_MARKETING');
    const content = DEFAULT_ONTOLOGY.find((g) => g.id === 'CONTENT_MARKETING');
    expect(email?.parentGroup).toBe('GROWTH_MARKETING');
    expect(content?.parentGroup).toBe('GROWTH_MARKETING');
  });

  it('groupRelationship: CRO ↔ ECOMMERCE_OPTIMIZATION = "parent-child"', () => {
    expect(groupRelationship('CRO', 'ECOMMERCE_OPTIMIZATION')).toBe('parent-child');
    expect(groupRelationship('ECOMMERCE_OPTIMIZATION', 'CRO')).toBe('parent-child');
  });

  it('groupRelationship: EMAIL_MARKETING ↔ CONTENT_MARKETING = "sibling"', () => {
    // Both have parentGroup = GROWTH_MARKETING
    expect(groupRelationship('EMAIL_MARKETING', 'CONTENT_MARKETING')).toBe('sibling');
  });

  it('groupRelationship: EXPERIMENTATION ↔ CRO = "related" (peers, not hierarchy)', () => {
    expect(groupRelationship('EXPERIMENTATION', 'CRO')).toBe('related');
    expect(groupRelationship('CRO', 'EXPERIMENTATION')).toBe('related');
  });

  it('groupRelationship: EXPERIMENTATION ↔ SEO = "unrelated"', () => {
    expect(groupRelationship('EXPERIMENTATION', 'SEO')).toBe('unrelated');
  });

  it('groupRelationship: same group = "same"', () => {
    expect(groupRelationship('CRO', 'CRO')).toBe('same');
  });

  it('hierarchy does NOT change groupSimilarity scores (backward compat)', () => {
    // relatedGroups values are unchanged — hierarchy is metadata only
    expect(groupSimilarity('CRO', 'ECOMMERCE_OPTIMIZATION')).toBe(0.55);
    expect(groupSimilarity('EXPERIMENTATION', 'CRO')).toBe(0.75);
  });
});

// ── 3. Evidence-based classification ─────────────────────────────────────────

describe('Phase 2: evidence-based classification', () => {
  it('classifies "Agency" from companyType + identity signal', () => {
    const result = accumulateTaxonomyEvidence({
      companyType: 'Agency',
      primaryCompetitiveIdentity: 'CRO Agency for eCommerce',
    });
    expect(result.businessModel).toBe('Agency');
    expect(result.topScore).toBeGreaterThan(0.5);
    expect(result.confidence['Agency']).toBeGreaterThan(result.confidence['SaaS']!);
  });

  it('classifies "SaaS" from services when companyType is null', () => {
    const result = accumulateTaxonomyEvidence({
      companyType: null,
      coreServices: ['SaaS subscription', 'API access', 'software platform'],
    });
    expect(result.businessModel).toBe('SaaS');
    expect(result.confidence['SaaS']).toBeGreaterThan(0);
  });

  it('classifies "Platform" from identity when companyType is vague', () => {
    const result = accumulateTaxonomyEvidence({
      companyType: null,
      primaryCompetitiveIdentity: 'Developer platform for growth teams',
      coreServices: ['developer tools', 'api platform', 'sdk'],
    });
    expect(['Platform', 'SaaS']).toContain(result.businessModel);
  });

  it('produces a confidence distribution summing to 1.0', () => {
    const result = accumulateTaxonomyEvidence({
      companyType: 'Agency',
      primarySpecialties: ['A/B Testing', 'CRO'],
    });
    const total = Object.values(result.confidence).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0, 1);
  });

  it('populates evidenceLog explaining WHY the model was chosen', () => {
    const result = accumulateTaxonomyEvidence({
      companyType: 'Agency',
      coreServices: ['managed service', 'consulting'],
    });
    expect(result.evidenceLog.length).toBeGreaterThan(0);
    expect(result.evidenceLog.some((l) => l.includes('Agency'))).toBe(true);
  });

  it('returns Other with topScore near 0 when no evidence at all', () => {
    const result = accumulateTaxonomyEvidence({});
    // Only the floor vote for 'Other' → confidence['Other'] ≈ 1.0
    expect(result.businessModel).toBe('Other');
  });

  it('produces mixed confidence for a hybrid company (Agency + SaaS signals)', () => {
    const result = accumulateTaxonomyEvidence({
      companyType: null,
      primaryCompetitiveIdentity: 'Agency with a software platform',
      coreServices: ['consulting', 'saas', 'managed service'],
    });
    const agencyConf = result.confidence['Agency'] ?? 0;
    const saasConf   = result.confidence['SaaS'] ?? 0;
    expect(agencyConf).toBeGreaterThan(0);
    expect(saasConf).toBeGreaterThan(0);
    // Neither should be overwhelmingly dominant
    expect(Math.abs(agencyConf - saasConf)).toBeLessThan(0.5);
  });
});

// ── 4. eCommerce companyType gap fixed ────────────────────────────────────────
//
// Context extractor AI produces 'eCommerce Brand' (two words).
// Profiling AI may produce 'eCommerce' (one word, no 'brand').
// BEFORE fix: inferBusinessModel('eCommerce') → 'Other'
// AFTER  fix: inferBusinessModel('eCommerce') → 'Brand'

describe('Phase 2: eCommerce companyType gap fixed', () => {
  it('classifyCompanyTaxonomy("eCommerce") → businessModel = Brand', () => {
    const tax = classifyCompanyTaxonomy({
      companyType: 'eCommerce',
      primaryCompetitiveIdentity: null,
      primarySpecialties: [],
      coreServices: [],
      targetAudience: [],
    });
    expect(tax.businessModel).toBe('Brand');
  });

  it('classifyCompanyTaxonomy("eCommerce Brand") → businessModel = Brand', () => {
    const tax = classifyCompanyTaxonomy({
      companyType: 'eCommerce Brand',
      primaryCompetitiveIdentity: null,
      primarySpecialties: [],
      coreServices: [],
      targetAudience: [],
    });
    expect(tax.businessModel).toBe('Brand');
  });

  it('classifyCompanyTaxonomy("E-commerce") → businessModel = Brand', () => {
    const tax = classifyCompanyTaxonomy({
      companyType: 'E-commerce',
      primaryCompetitiveIdentity: null,
      primarySpecialties: [],
      coreServices: [],
      targetAudience: [],
    });
    expect(tax.businessModel).toBe('Brand');
  });

  it('companyType without known mapping still falls back to evidence accumulator', () => {
    // A company that the AI labeled with a non-standard type but whose services
    // clearly signal SaaS should NOT land in 'Other'
    const tax = classifyCompanyTaxonomy({
      companyType: null,
      primaryCompetitiveIdentity: 'A/B testing software platform',
      primarySpecialties: [],
      coreServices: ['SaaS subscription', 'software platform'],
      targetAudience: [],
    });
    // Should be SaaS or Platform (evidence-driven), NOT Other
    expect(tax.businessModel).not.toBe('Other');
  });

  it('classifyCompanyTaxonomy returns businessModelConfidence', () => {
    const tax = classifyCompanyTaxonomy({
      companyType: 'Agency',
      primaryCompetitiveIdentity: 'CRO Agency',
      primarySpecialties: ['CRO', 'A/B Testing'],
      coreServices: [],
      targetAudience: [],
    });
    expect(tax.businessModelConfidence).toBeDefined();
    expect(typeof tax.businessModelConfidence['Agency']).toBe('number');
    expect(tax.businessModelConfidence['Agency']).toBeGreaterThan(0);
  });
});
