import { describe, it, expect } from 'vitest';
import { classifyCompanyTaxonomy, taxonomyAlignment, type TaxonomyInput } from '../taxonomy';

function makeInput(overrides: Partial<TaxonomyInput> = {}): TaxonomyInput {
  return {
    companyType: null,
    primaryCompetitiveIdentity: null,
    primarySpecialties: [],
    coreServices: [],
    targetAudience: [],
    ...overrides,
  };
}

describe('classifyCompanyTaxonomy', () => {
  it('classifies Agency correctly', () => {
    const tax = classifyCompanyTaxonomy(makeInput({ companyType: 'Agency' }));
    expect(tax.businessModel).toBe('Agency');
    expect(tax.deliveryModel).toBe('ServiceDelivery');
  });

  it('classifies SaaS correctly', () => {
    const tax = classifyCompanyTaxonomy(makeInput({ companyType: 'SaaS' }));
    expect(tax.businessModel).toBe('SaaS');
    expect(tax.deliveryModel).toBe('SoftwareDelivery');
  });

  it('classifies Consulting correctly', () => {
    const tax = classifyCompanyTaxonomy(makeInput({ companyType: 'Consulting' }));
    expect(tax.businessModel).toBe('Consulting');
    expect(tax.deliveryModel).toBe('ServiceDelivery');
  });

  it('handles null companyType as Other', () => {
    const tax = classifyCompanyTaxonomy(makeInput({ companyType: null }));
    expect(tax.businessModel).toBe('Other');
  });

  it('maps specialties to primaryGroups via ontology', () => {
    const tax = classifyCompanyTaxonomy(makeInput({
      companyType: 'Agency',
      primarySpecialties: ['A/B Testing', 'CRO'],
    }));
    expect(tax.primaryGroups).toContain('EXPERIMENTATION');
    expect(tax.primaryGroups).toContain('CRO');
  });

  it('infers B2B market from audience', () => {
    const tax = classifyCompanyTaxonomy(makeInput({
      companyType: 'Agency',
      targetAudience: ['B2B brands', 'marketers'],
    }));
    expect(tax.marketType).toBe('B2B');
  });

  it('infers Enterprise market from audience', () => {
    const tax = classifyCompanyTaxonomy(makeInput({
      companyType: 'SaaS',
      targetAudience: ['enterprise companies', 'large teams'],
    }));
    expect(tax.marketType).toBe('Enterprise');
  });

  it('infers Niche audienceScope from eCommerce context', () => {
    const tax = classifyCompanyTaxonomy(makeInput({
      companyType: 'Agency',
      targetAudience: ['ecommerce brands'],
    }));
    expect(tax.audienceScope).toBe('Niche');
  });
});

describe('taxonomyAlignment', () => {
  it('returns 1.0 for identical taxonomies', () => {
    const a = classifyCompanyTaxonomy(makeInput({
      companyType: 'Agency',
      primarySpecialties: ['A/B Testing', 'CRO'],
      targetAudience: ['B2B brands'],
    }));
    expect(taxonomyAlignment(a, a)).toBeCloseTo(1.0, 1);
  });

  it('Agency vs Agency alignment is higher than Agency vs SaaS', () => {
    const agency1 = classifyCompanyTaxonomy(makeInput({ companyType: 'Agency', primarySpecialties: ['A/B Testing'] }));
    const agency2 = classifyCompanyTaxonomy(makeInput({ companyType: 'Agency', primarySpecialties: ['CRO'] }));
    const saas    = classifyCompanyTaxonomy(makeInput({ companyType: 'SaaS', primarySpecialties: ['A/B Testing'] }));

    const agencyVsAgency = taxonomyAlignment(agency1, agency2);
    const agencyVsSaas   = taxonomyAlignment(agency1, saas);

    expect(agencyVsAgency).toBeGreaterThan(agencyVsSaas);
  });

  it('Agency vs Consulting is higher than Agency vs SaaS', () => {
    const agency      = classifyCompanyTaxonomy(makeInput({ companyType: 'Agency' }));
    const consulting  = classifyCompanyTaxonomy(makeInput({ companyType: 'Consulting' }));
    const saas        = classifyCompanyTaxonomy(makeInput({ companyType: 'SaaS' }));

    expect(taxonomyAlignment(agency, consulting)).toBeGreaterThan(taxonomyAlignment(agency, saas));
  });

  it('SaaS vs Platform is higher than SaaS vs Agency', () => {
    const saas      = classifyCompanyTaxonomy(makeInput({ companyType: 'SaaS' }));
    const platform  = classifyCompanyTaxonomy(makeInput({ companyType: 'Platform' }));
    const agency    = classifyCompanyTaxonomy(makeInput({ companyType: 'Agency' }));

    expect(taxonomyAlignment(saas, platform)).toBeGreaterThan(taxonomyAlignment(saas, agency));
  });

  it('same specialty groups produce higher alignment than mismatched groups', () => {
    const experimentationAgency = classifyCompanyTaxonomy(makeInput({
      companyType: 'Agency',
      primarySpecialties: ['A/B Testing', 'Experimentation'],
    }));
    const croAgency = classifyCompanyTaxonomy(makeInput({
      companyType: 'Agency',
      primarySpecialties: ['Conversion Rate Optimization'],
    }));
    const seoAgency = classifyCompanyTaxonomy(makeInput({
      companyType: 'Agency',
      primarySpecialties: ['Search Engine Optimization'],
    }));

    const expVsCro = taxonomyAlignment(experimentationAgency, croAgency);
    const expVsSeo = taxonomyAlignment(experimentationAgency, seoAgency);

    expect(expVsCro).toBeGreaterThan(expVsSeo);
  });

  it('returns a value between 0 and 1 for any pair', () => {
    const a = classifyCompanyTaxonomy(makeInput({ companyType: 'Agency', primarySpecialties: ['SEO'] }));
    const b = classifyCompanyTaxonomy(makeInput({ companyType: 'Media', targetAudience: ['B2C consumers'] }));
    const score = taxonomyAlignment(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
