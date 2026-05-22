import { describe, expect, it } from 'vitest';
import { DiscoveryInputSchema, AICompetitorResponseSchema } from '../validators/discovery.validator';

describe('DiscoveryInputSchema', () => {
  const validInput = {
    normalizedDomain: 'brillmark.com',
    exclusions: ['convertcart.com', 'invespcro.com'],
    queryId: '550e8400-e29b-41d4-a716-446655440000',
  };

  it('accepts valid input', () => {
    expect(DiscoveryInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('defaults exclusions to empty array when omitted', () => {
    const result = DiscoveryInputSchema.safeParse({
      normalizedDomain: 'example.com',
      queryId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success && result.data.exclusions).toEqual([]);
  });

  it('rejects missing normalizedDomain', () => {
    const result = DiscoveryInputSchema.safeParse({ ...validInput, normalizedDomain: undefined });
    expect(result.success).toBe(false);
  });

  it('rejects empty normalizedDomain', () => {
    const result = DiscoveryInputSchema.safeParse({ ...validInput, normalizedDomain: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid queryId (not a UUID)', () => {
    const result = DiscoveryInputSchema.safeParse({ ...validInput, queryId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing queryId', () => {
    const result = DiscoveryInputSchema.safeParse({ ...validInput, queryId: undefined });
    expect(result.success).toBe(false);
  });

  it('accepts empty exclusions array', () => {
    const result = DiscoveryInputSchema.safeParse({ ...validInput, exclusions: [] });
    expect(result.success).toBe(true);
  });
});

describe('AICompetitorResponseSchema', () => {
  it('accepts valid response', () => {
    const result = AICompetitorResponseSchema.safeParse({ competitors: ['speero.com', 'cro.media'] });
    expect(result.success).toBe(true);
  });

  it('defaults competitors to empty array when omitted', () => {
    const result = AICompetitorResponseSchema.safeParse({});
    expect(result.success && result.data.competitors).toEqual([]);
  });

  it('rejects competitors array exceeding 100 items', () => {
    const overLimit = Array.from({ length: 101 }, (_, i) => `domain${i}.com`);
    const result = AICompetitorResponseSchema.safeParse({ competitors: overLimit });
    expect(result.success).toBe(false);
  });

  it('rejects non-array competitors field', () => {
    const result = AICompetitorResponseSchema.safeParse({ competitors: 'domain.com' });
    expect(result.success).toBe(false);
  });
});
