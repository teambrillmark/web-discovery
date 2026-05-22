import { describe, it, expect } from 'vitest';
import { deduplicateBatch } from '../utils/batch.utils';
import type { DeduplicationInput } from '../types';

const makeInput = (domain: string, queryId = 'q1'): DeduplicationInput => ({
  normalizedDomain: domain,
  originalValue: domain,
  source: 'groq',
  discoveryMethod: 'ai-discovery',
  queryId,
  discoveredAt: new Date().toISOString(),
});

describe('deduplicateBatch', () => {
  it('returns all items when no duplicates', () => {
    const input = [makeInput('a.com'), makeInput('b.com'), makeInput('c.com')];
    const { unique, duplicates } = deduplicateBatch(input);
    expect(unique).toHaveLength(3);
    expect(duplicates).toHaveLength(0);
  });

  it('keeps first occurrence, marks rest as duplicates', () => {
    const input = [makeInput('a.com'), makeInput('a.com'), makeInput('a.com')];
    const { unique, duplicates } = deduplicateBatch(input);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(2);
    expect(unique[0]?.normalizedDomain).toBe('a.com');
  });

  it('handles mixed domains with partial duplicates', () => {
    const input = [
      makeInput('a.com'), makeInput('b.com'), makeInput('a.com'), makeInput('c.com'),
    ];
    const { unique, duplicates } = deduplicateBatch(input);
    expect(unique).toHaveLength(3);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.normalizedDomain).toBe('a.com');
  });

  it('returns empty arrays for empty input', () => {
    const { unique, duplicates } = deduplicateBatch([]);
    expect(unique).toHaveLength(0);
    expect(duplicates).toHaveLength(0);
  });

  it('preserves source and metadata on unique items', () => {
    const input = [
      { ...makeInput('a.com'), source: 'groq' },
      { ...makeInput('b.com'), source: 'stub-search' },
    ];
    const { unique } = deduplicateBatch(input);
    expect(unique[0]?.source).toBe('groq');
    expect(unique[1]?.source).toBe('stub-search');
  });

  it('treats different domains independently', () => {
    const input = [makeInput('groq.com'), makeInput('stub.com')];
    const { unique, duplicates } = deduplicateBatch(input);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});
