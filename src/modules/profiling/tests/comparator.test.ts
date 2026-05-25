import { describe, it, expect } from 'vitest';
import { tokenize, jaccardSimilarity, tokenOverlap, industryMatch, sharedTokens } from '../scoring/comparator';

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    const tokens = tokenize('A/B Testing Agency');
    expect(tokens.has('testing')).toBe(true);
    expect(tokens.has('agency')).toBe(true);
  });

  it('removes punctuation and short tokens', () => {
    const tokens = tokenize('CRO & UX');
    // 'cro' length=3, kept. 'ux' length=2, kept. '&' filtered
    expect(tokens.has('cro')).toBe(true);
    expect(tokens.has('ux')).toBe(true);
  });

  it('filters stopwords', () => {
    const tokens = tokenize('the best of the best');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('of')).toBe(false);
    expect(tokens.has('best')).toBe(true);
  });

  it('deduplicates tokens (returns a Set)', () => {
    const tokens = tokenize('testing testing testing');
    expect(tokens.size).toBe(1);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical arrays', () => {
    const a = ['A/B Testing', 'CRO'];
    expect(jaccardSimilarity(a, a)).toBe(1);
  });

  it('returns 0 for completely different arrays', () => {
    expect(jaccardSimilarity(['accounting', 'payroll'], ['experimentation', 'testing'])).toBe(0);
  });

  it('returns 1 for two empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('returns 0 when one array is empty', () => {
    expect(jaccardSimilarity(['testing'], [])).toBe(0);
    expect(jaccardSimilarity([], ['testing'])).toBe(0);
  });

  it('computes partial overlap correctly', () => {
    // A tokens: {experimentation, testing, cro} (3)
    // B tokens: {testing, cro, shopify} (3)
    // intersection: {testing, cro} = 2
    // union: 4
    const a = ['Experimentation', 'Testing', 'CRO'];
    const b = ['Testing', 'CRO', 'Shopify'];
    const result = jaccardSimilarity(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('is higher for closely related arrays than unrelated ones', () => {
    const cro1 = ['A/B Testing', 'CRO', 'Experimentation'];
    const cro2 = ['Experimentation', 'A/B Testing', 'Conversion Optimization'];
    const unrelated = ['Payroll', 'HR Software', 'Benefits Management'];
    expect(jaccardSimilarity(cro1, cro2)).toBeGreaterThan(jaccardSimilarity(cro1, unrelated));
  });
});

describe('tokenOverlap', () => {
  it('returns 1 for identical strings', () => {
    expect(tokenOverlap('CRO Agency', 'CRO Agency')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(tokenOverlap('payroll software', 'experimentation agency')).toBe(0);
  });

  it('returns 0 for empty strings', () => {
    expect(tokenOverlap('', 'testing')).toBe(0);
    expect(tokenOverlap('testing', '')).toBe(0);
  });

  it('partial overlap: "A/B Testing Agency" vs "A/B Testing" gives high overlap', () => {
    const result = tokenOverlap('A/B Testing Agency', 'A/B Testing');
    expect(result).toBeGreaterThanOrEqual(0.5);
  });

  it('uses max(|A|, |B|) as denominator — longer set penalises specificity', () => {
    // "CRO" (1 token) vs "CRO Agency Consulting" (3 tokens)
    // intersection = 1, max = 3, overlap = 0.33
    const result = tokenOverlap('CRO', 'CRO Agency Consulting');
    expect(result).toBeCloseTo(1 / 3, 1);
  });
});

describe('industryMatch', () => {
  it('returns true for same industry', () => {
    expect(industryMatch('Marketing', 'Marketing')).toBe(true);
  });

  it('returns true for overlapping industry terms', () => {
    expect(industryMatch('Digital Marketing', 'Marketing')).toBe(true);
  });

  it('returns false for completely different industries', () => {
    expect(industryMatch('Healthcare', 'eCommerce')).toBe(false);
  });

  it('returns false for null inputs', () => {
    expect(industryMatch(null, 'Marketing')).toBe(false);
    expect(industryMatch('Marketing', null)).toBe(false);
  });
});

describe('sharedTokens', () => {
  it('returns tokens that appear in both arrays (using normalized canonical tokens)', () => {
    // 'A/B Testing' → 'abtesting', 'CRO' → 'abtesting' (cross-cluster: cro→abtesting)
    // 'CRO consulting' → 'cro' → 'abtesting'
    // Both sides share the canonical 'abtesting' token
    const a = ['A/B Testing', 'CRO'];
    const b = ['CRO consulting', 'SEO'];
    const shared = sharedTokens(a, b);
    expect(shared).toContain('abtesting');
  });

  it('returns empty array for no overlap', () => {
    expect(sharedTokens(['accounting'], ['experimentation'])).toHaveLength(0);
  });

  it('returns empty array when both inputs are semantically unrelated to each other', () => {
    expect(sharedTokens(['payroll', 'hr software'], ['ecommerce platform'])).toHaveLength(0);
  });
});
