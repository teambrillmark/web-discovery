import { describe, it, expect } from 'vitest';
import { applyRuleFilter } from '../rules/rule-filter';
import { isBlocklistedDomain, isSubdomainDomain, getRootDomain } from '../rules/domain-blocklist';

describe('getRootDomain', () => {
  it('returns 2-label root for standard TLDs', () => {
    expect(getRootDomain('optimizely.com')).toBe('optimizely.com');
    expect(getRootDomain('app.optimizely.com')).toBe('optimizely.com');
  });

  it('handles 2-part ccTLDs', () => {
    expect(getRootDomain('glassdoor.co.uk')).toBe('glassdoor.co.uk');
    expect(getRootDomain('bbc.co.uk')).toBe('bbc.co.uk');
    expect(getRootDomain('login.glassdoor.co.uk')).toBe('glassdoor.co.uk');
  });
});

describe('isSubdomainDomain', () => {
  it('rejects known non-competitor subdomains', () => {
    expect(isSubdomainDomain('login.company.com')).toBe(true);
    expect(isSubdomainDomain('accounts.company.com')).toBe(true);
    expect(isSubdomainDomain('cdn.company.com')).toBe(true);
    expect(isSubdomainDomain('api.company.com')).toBe(true);
    expect(isSubdomainDomain('docs.company.com')).toBe(true);
    expect(isSubdomainDomain('auth.company.com')).toBe(true);
    expect(isSubdomainDomain('careers.company.com')).toBe(true);
  });

  it('accepts root domains', () => {
    expect(isSubdomainDomain('company.com')).toBe(false);
    expect(isSubdomainDomain('optimizely.com')).toBe(false);
    expect(isSubdomainDomain('glassdoor.co.uk')).toBe(false);
  });

  it('accepts unknown subdomains (not on the block list)', () => {
    // "team.company.com" is a subdomain but not on the known-non-competitor list
    expect(isSubdomainDomain('team.company.com')).toBe(false);
  });
});

describe('isBlocklistedDomain', () => {
  it('blocks social/community platforms', () => {
    expect(isBlocklistedDomain('meetup.com').blocked).toBe(true);
    expect(isBlocklistedDomain('slideshare.net').blocked).toBe(true);
    expect(isBlocklistedDomain('reddit.com').blocked).toBe(true);
    expect(isBlocklistedDomain('linkedin.com').blocked).toBe(true);
  });

  it('blocks job boards', () => {
    expect(isBlocklistedDomain('glassdoor.com').blocked).toBe(true);
    expect(isBlocklistedDomain('glassdoor.co.uk').blocked).toBe(true);
    expect(isBlocklistedDomain('bamboohr.com').blocked).toBe(true);
    expect(isBlocklistedDomain('indeed.com').blocked).toBe(true);
  });

  it('blocks app stores', () => {
    expect(isBlocklistedDomain('apps.apple.com').blocked).toBe(true);
    expect(isBlocklistedDomain('g2.com').blocked).toBe(true);
    expect(isBlocklistedDomain('capterra.com').blocked).toBe(true);
  });

  it('blocks infrastructure domains', () => {
    expect(isBlocklistedDomain('github.com').blocked).toBe(true);
    expect(isBlocklistedDomain('amazonaws.com').blocked).toBe(true);
  });

  it('assigns correct rejection category', () => {
    expect(isBlocklistedDomain('meetup.com').category).toBe('community-platform');
    expect(isBlocklistedDomain('glassdoor.com').category).toBe('job-board');
    expect(isBlocklistedDomain('apps.apple.com').category).toBe('app-store');
    expect(isBlocklistedDomain('amazonaws.com').category).toBe('infrastructure-domain');
  });

  it('does NOT block legitimate competitor domains', () => {
    expect(isBlocklistedDomain('optimizely.com').blocked).toBe(false);
    expect(isBlocklistedDomain('vwo.com').blocked).toBe(false);
    expect(isBlocklistedDomain('conversionrate.store').blocked).toBe(false);
    expect(isBlocklistedDomain('speero.com').blocked).toBe(false);
    expect(isBlocklistedDomain('experimentengine.io').blocked).toBe(false);
  });
});

describe('applyRuleFilter', () => {
  describe('REJECT cases', () => {
    it('rejects meetup.com as community-platform', () => {
      const r = applyRuleFilter('meetup.com');
      expect(r.passed).toBe(false);
      expect(r.result.rejectionReason).toBe('community-platform');
      expect(r.result.rejectionStage).toBe('rule-filter');
      expect(r.result.accepted).toBe(false);
    });

    it('rejects glassdoor.co.uk as job-board', () => {
      const r = applyRuleFilter('glassdoor.co.uk');
      expect(r.passed).toBe(false);
      expect(r.result.rejectionReason).toBe('job-board');
    });

    it('rejects bamboohr.com as job-board', () => {
      const r = applyRuleFilter('bamboohr.com');
      expect(r.passed).toBe(false);
      expect(r.result.rejectionReason).toBe('job-board');
    });

    it('rejects apps.apple.com as app-store', () => {
      const r = applyRuleFilter('apps.apple.com');
      expect(r.passed).toBe(false);
      expect(r.result.rejectionReason).toBe('app-store');
    });

    it('rejects slideshare.net as community-platform', () => {
      const r = applyRuleFilter('slideshare.net');
      expect(r.passed).toBe(false);
      expect(r.result.rejectionReason).toBe('community-platform');
    });

    it('rejects login subdomains', () => {
      const r = applyRuleFilter('login.company.com');
      expect(r.passed).toBe(false);
      expect(r.result.rejectionReason).toBe('non-competitor-subdomain');
    });

    it('rejects readthedocs.io patterns', () => {
      const r = applyRuleFilter('myproject.readthedocs.io');
      expect(r.passed).toBe(false);
      // readthedocs.io is in the DOCUMENTATION blocklist → 'documentation-site'
      expect(r.result.rejectionReason).toBe('documentation-site');
    });
  });

  describe('PASS cases', () => {
    it('passes known experimentation agencies', () => {
      expect(applyRuleFilter('optimizely.com').passed).toBe(true);
      expect(applyRuleFilter('vwo.com').passed).toBe(true);
      expect(applyRuleFilter('speero.com').passed).toBe(true);
      expect(applyRuleFilter('conversionxl.com').passed).toBe(true);
    });

    it('passes unknown agencies (benefit of the doubt)', () => {
      expect(applyRuleFilter('experimentlab.io').passed).toBe(true);
      expect(applyRuleFilter('cro-experts.com').passed).toBe(true);
      expect(applyRuleFilter('testingagency.co.uk').passed).toBe(true);
    });

    it('passes domains with accepted subdomains (non-functional first label)', () => {
      // "team.company.com" is a subdomain but "team" isn't on the non-competitor list
      expect(applyRuleFilter('team.company.com').passed).toBe(true);
    });
  });

  describe('result shape', () => {
    it('passed result has accepted=true and no rejectionReason', () => {
      const r = applyRuleFilter('optimizely.com');
      expect(r.result.accepted).toBe(true);
      expect(r.result.rejectionReason).toBeUndefined();
      expect(r.result.rejectionStage).toBeUndefined();
    });

    it('rejected result has high confidence', () => {
      const r = applyRuleFilter('meetup.com');
      expect(r.result.confidence).toBeGreaterThanOrEqual(0.90);
    });
  });
});
