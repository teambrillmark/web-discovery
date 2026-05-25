import { describe, it, expect } from 'vitest';
import { classifyEntityType } from '../classifiers/entity-classifier';

describe('classifyEntityType', () => {
  it('classifies agency domains', () => {
    expect(classifyEntityType('conversionagency.com')).toBe('agency');
    expect(classifyEntityType('cro-consulting.io')).toBe('agency');
    expect(classifyEntityType('growthlab.co')).toBe('agency');
    expect(classifyEntityType('optimizationstudio.com')).toBe('agency');
    expect(classifyEntityType('experimentpartners.com')).toBe('agency');
    expect(classifyEntityType('crolabs.com')).toBe('agency');
  });

  it('classifies SaaS domains', () => {
    expect(classifyEntityType('analyticsplatform.com')).toBe('saas');
    expect(classifyEntityType('experimentationsoftware.io')).toBe('saas');
    expect(classifyEntityType('testingcloud.com')).toBe('saas');
  });

  it('classifies community domains', () => {
    expect(classifyEntityType('cronetwork.com')).toBe('community');
    expect(classifyEntityType('optimizationforum.org')).toBe('community');
  });

  it('classifies directory domains', () => {
    expect(classifyEntityType('bestabtestingtools.com')).toBe('directory');
    expect(classifyEntityType('topconversionagencies.com')).toBe('directory');
  });

  it('classifies marketplace domains', () => {
    expect(classifyEntityType('conversionmarketplace.com')).toBe('marketplace');
    expect(classifyEntityType('agencycompare.com')).toBe('marketplace');
  });

  it('returns unknown for non-matching domains', () => {
    expect(classifyEntityType('vwo.com')).toBe('unknown');
    expect(classifyEntityType('speero.com')).toBe('unknown');
    expect(classifyEntityType('brillmark.com')).toBe('unknown');
  });

  it('uses TLD as SaaS hint for .io domains', () => {
    // If no fragment matches but TLD is .io → SaaS
    expect(classifyEntityType('unknownxyz.io')).toBe('saas');
    expect(classifyEntityType('randombusiness.ai')).toBe('saas');
  });

  it('agency fragments take priority over TLD hint', () => {
    // agency fragment wins over .io TLD
    expect(classifyEntityType('growthlabs.io')).toBe('agency');
  });
});
