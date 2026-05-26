import { describe, it, expect } from 'vitest';
import { semanticSpecialtyOverlap } from '../semantic-matcher';

describe('semanticSpecialtyOverlap', () => {
  it('returns score 1.0 for identical specialties mapping to same group', () => {
    const result = semanticSpecialtyOverlap(
      ['A/B Testing', 'Experimentation'],
      ['A/B Testing', 'Split Testing'],
    );
    expect(result.score).toBeCloseTo(1.0, 1);
    expect(result.directGroups).toContain('EXPERIMENTATION');
  });

  it('gives partial credit for CRO vs A/B Testing (related groups, not identical)', () => {
    const result = semanticSpecialtyOverlap(
      ['A/B Testing', 'Experimentation'],
      ['Conversion Rate Optimization'],
    );
    // CRO and EXPERIMENTATION have 0.75 similarity — should be meaningful partial credit
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThan(1.0);
    expect(result.partialGroups.length).toBeGreaterThan(0);
  });

  it('returns lower score for unrelated groups', () => {
    const experimentResult = semanticSpecialtyOverlap(
      ['A/B Testing'],
      ['Conversion Rate Optimization'],
    );
    const seoResult = semanticSpecialtyOverlap(
      ['A/B Testing'],
      ['Search Engine Optimization'],
    );
    expect(experimentResult.score).toBeGreaterThan(seoResult.score);
  });

  it('returns 0 for empty inputs', () => {
    expect(semanticSpecialtyOverlap([], ['A/B Testing']).score).toBe(0);
    expect(semanticSpecialtyOverlap(['A/B Testing'], []).score).toBe(0);
    expect(semanticSpecialtyOverlap([], []).score).toBe(0);
  });

  it('returns 0 for completely unrelated specialties', () => {
    const result = semanticSpecialtyOverlap(
      ['A/B Testing'],
      ['plumbing services'],
    );
    expect(result.score).toBe(0);
  });

  it('includes directGroups when specialties map to same group', () => {
    const result = semanticSpecialtyOverlap(
      ['Experimentation', 'Feature Flags'],
      ['A/B Testing', 'Split Testing'],
    );
    expect(result.directGroups).toContain('EXPERIMENTATION');
  });

  it('includes reasoning string', () => {
    const result = semanticSpecialtyOverlap(
      ['A/B Testing'],
      ['Conversion Rate Optimization'],
    );
    expect(typeof result.reasoning).toBe('string');
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('score is between 0 and 1', () => {
    const result = semanticSpecialtyOverlap(
      ['A/B Testing', 'CRO', 'Personalization'],
      ['Conversion Rate Optimization', 'User Experience Design'],
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
