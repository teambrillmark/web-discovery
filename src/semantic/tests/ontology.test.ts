import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ONTOLOGY,
  mapToSemanticGroups,
  groupSimilarity,
  getGroupAcronyms,
  getGroupKeywords,
} from '../ontology';

describe('mapToSemanticGroups', () => {
  it('maps A/B testing text to EXPERIMENTATION', () => {
    const groups = mapToSemanticGroups('A/B Testing Agency');
    expect(groups).toContain('EXPERIMENTATION');
  });

  it('maps CRO text to CRO', () => {
    const groups = mapToSemanticGroups('Conversion Rate Optimization');
    expect(groups).toContain('CRO');
  });

  it('maps array of specialties', () => {
    const groups = mapToSemanticGroups(['A/B Testing', 'Personalization', 'Web Analytics']);
    expect(groups).toContain('EXPERIMENTATION');
    expect(groups).toContain('PERSONALIZATION');
    expect(groups).toContain('ANALYTICS');
  });

  it('returns empty array for unrelated text', () => {
    const groups = mapToSemanticGroups('plumbing services');
    expect(groups).toHaveLength(0);
  });

  it('does not return duplicates', () => {
    const groups = mapToSemanticGroups('a/b testing split testing experimentation');
    const unique = [...new Set(groups)];
    expect(groups).toHaveLength(unique.length);
  });

  it('matches case-insensitively', () => {
    expect(mapToSemanticGroups('SEO')).toContain('SEO');
    expect(mapToSemanticGroups('seo')).toContain('SEO');
    expect(mapToSemanticGroups('Search Engine Optimization')).toContain('SEO');
  });
});

describe('groupSimilarity', () => {
  it('returns 1.0 for same group', () => {
    expect(groupSimilarity('EXPERIMENTATION', 'EXPERIMENTATION')).toBe(1.0);
  });

  it('returns high similarity for CRO ↔ EXPERIMENTATION (0.75)', () => {
    expect(groupSimilarity('EXPERIMENTATION', 'CRO')).toBe(0.75);
    expect(groupSimilarity('CRO', 'EXPERIMENTATION')).toBe(0.75);
  });

  it('returns moderate similarity for EXPERIMENTATION ↔ PERSONALIZATION (0.50)', () => {
    expect(groupSimilarity('EXPERIMENTATION', 'PERSONALIZATION')).toBe(0.50);
  });

  it('returns 0 for unrelated groups', () => {
    expect(groupSimilarity('SEO', 'EXPERIMENTATION')).toBe(0);
  });

  it('returns 0 for unknown group IDs', () => {
    expect(groupSimilarity('UNKNOWN_GROUP', 'CRO')).toBe(0);
  });
});

describe('getGroupAcronyms', () => {
  it('returns acronyms for EXPERIMENTATION group', () => {
    const acronyms = getGroupAcronyms(['EXPERIMENTATION']);
    expect(acronyms).toContain('abt');
    expect(acronyms).toContain('mvt');
  });

  it('returns acronyms for CRO group', () => {
    const acronyms = getGroupAcronyms(['CRO']);
    expect(acronyms).toContain('cro');
  });

  it('merges acronyms across multiple groups', () => {
    const acronyms = getGroupAcronyms(['EXPERIMENTATION', 'SEO', 'UX_RESEARCH']);
    expect(acronyms).toContain('abt');
    expect(acronyms).toContain('seo');
    expect(acronyms).toContain('ux');
  });

  it('includes related group acronyms when threshold is set', () => {
    // EXPERIMENTATION → CRO (0.75 similarity) → include 'cro' when threshold ≤ 0.75
    const withRelated = getGroupAcronyms(['EXPERIMENTATION'], DEFAULT_ONTOLOGY, 0.5);
    expect(withRelated).toContain('cro');
  });

  it('does not include distantly related groups below threshold', () => {
    // SEO is not related to EXPERIMENTATION
    const acronyms = getGroupAcronyms(['EXPERIMENTATION'], DEFAULT_ONTOLOGY, 0.5);
    expect(acronyms).not.toContain('seo');
  });

  it('returns empty array for empty group list', () => {
    expect(getGroupAcronyms([])).toHaveLength(0);
  });
});

describe('getGroupKeywords', () => {
  it('returns synonyms for EXPERIMENTATION', () => {
    const kws = getGroupKeywords(['EXPERIMENTATION']);
    expect(kws).toContain('a/b testing');
    expect(kws).toContain('experimentation');
    expect(kws).toContain('split testing');
  });

  it('merges keywords across multiple groups without duplicates', () => {
    const kws = getGroupKeywords(['CRO', 'ANALYTICS']);
    const unique = [...new Set(kws)];
    expect(kws.length).toBe(unique.length);
    expect(kws).toContain('conversion rate optimization');
    expect(kws).toContain('web analytics');
  });

  it('returns empty array for unknown group IDs', () => {
    expect(getGroupKeywords(['DOES_NOT_EXIST'])).toHaveLength(0);
  });
});
