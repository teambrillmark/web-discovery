import { describe, it, expect } from 'vitest';
import { DeduplicationInputSchema, DeduplicationInputItemSchema } from '../validators/deduplication.validator';

const validItem = {
  normalizedDomain: 'speero.com',
  originalValue: 'https://www.speero.com',
  source: 'groq',
  discoveryMethod: 'ai-discovery',
  queryId: '550e8400-e29b-41d4-a716-446655440000',
  discoveredAt: new Date().toISOString(),
};

describe('DeduplicationInputItemSchema', () => {
  it('accepts a valid item', () => {
    expect(DeduplicationInputItemSchema.safeParse(validItem).success).toBe(true);
  });

  it('rejects missing normalizedDomain', () => {
    const { normalizedDomain: _, ...rest } = validItem;
    expect(DeduplicationInputItemSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty normalizedDomain', () => {
    expect(DeduplicationInputItemSchema.safeParse({ ...validItem, normalizedDomain: '' }).success).toBe(false);
  });

  it('rejects uppercase normalizedDomain', () => {
    expect(DeduplicationInputItemSchema.safeParse({ ...validItem, normalizedDomain: 'SPEERO.COM' }).success).toBe(false);
  });

  it('rejects invalid UUID for queryId', () => {
    expect(DeduplicationInputItemSchema.safeParse({ ...validItem, queryId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects non-ISO discoveredAt', () => {
    expect(DeduplicationInputItemSchema.safeParse({ ...validItem, discoveredAt: 'not-a-date' }).success).toBe(false);
  });

  it('rejects oversized normalizedDomain', () => {
    const long = 'a'.repeat(254);
    expect(DeduplicationInputItemSchema.safeParse({ ...validItem, normalizedDomain: long }).success).toBe(false);
  });
});

describe('DeduplicationInputSchema (array)', () => {
  it('accepts empty array', () => {
    expect(DeduplicationInputSchema.safeParse([]).success).toBe(true);
  });

  it('accepts array of valid items', () => {
    expect(DeduplicationInputSchema.safeParse([validItem, { ...validItem, normalizedDomain: 'vwo.com' }]).success).toBe(true);
  });

  it('rejects array containing an invalid item', () => {
    expect(DeduplicationInputSchema.safeParse([validItem, { ...validItem, queryId: 'bad' }]).success).toBe(false);
  });
});
