import { describe, it, expect } from 'vitest';
import {
  cleanText,
  deduplicateLines,
  truncateToLimit,
  isSparseContent,
  buildContentForAI,
} from '../utils/content.utils';

describe('cleanText', () => {
  it('collapses multiple whitespace into single space', () => {
    expect(cleanText('foo   bar\n\nbaz')).toBe('foo bar baz');
  });

  it('trims leading and trailing whitespace', () => {
    expect(cleanText('  hello  ')).toBe('hello');
  });

  it('returns empty string for blank input', () => {
    expect(cleanText('   ')).toBe('');
  });
});

describe('deduplicateLines', () => {
  it('removes duplicate lines', () => {
    const input = 'foo\nbar\nfoo\nbaz\nbar';
    expect(deduplicateLines(input)).toBe('foo\nbar\nbaz');
  });

  it('preserves order of first occurrence', () => {
    const input = 'c\na\nb\na\nc';
    expect(deduplicateLines(input)).toBe('c\na\nb');
  });

  it('removes blank lines', () => {
    const input = 'foo\n\nbar\n  \nbaz';
    expect(deduplicateLines(input)).toBe('foo\nbar\nbaz');
  });
});

describe('truncateToLimit', () => {
  it('returns text unchanged if within limit', () => {
    const text = 'short text';
    expect(truncateToLimit(text, 100)).toBe(text);
  });

  it('truncates and appends marker when over limit', () => {
    const text = 'a'.repeat(200);
    const result = truncateToLimit(text, 100);
    expect(result).toContain('[content truncated]');
    expect(result.length).toBeLessThan(200);
  });
});

describe('isSparseContent', () => {
  it('returns true for text under 300 chars', () => {
    expect(isSparseContent('short')).toBe(true);
    expect(isSparseContent('')).toBe(true);
  });

  it('returns false for text of 300+ visible chars', () => {
    expect(isSparseContent('a'.repeat(300))).toBe(false);
    expect(isSparseContent('a'.repeat(400))).toBe(false);
  });
});

describe('buildContentForAI', () => {
  it('includes all non-empty sections with labels', () => {
    const result = buildContentForAI(
      'My Company',
      'We do CRO',
      ['Boost Conversions', 'Shopify Experts'],
      'Hero text here',
      'Services text here',
      'About text here',
      ['Home', 'Services', 'About'],
      'Body text here',
    );
    expect(result).toContain('TITLE: My Company');
    expect(result).toContain('META DESCRIPTION: We do CRO');
    expect(result).toContain('HERO SECTION:');
    expect(result).toContain('SERVICES SECTION:');
    expect(result).toContain('ABOUT SECTION:');
  });

  it('omits empty sections', () => {
    const result = buildContentForAI('Title', '', [], '', '', '', [], '');
    expect(result).not.toContain('META DESCRIPTION');
    expect(result).not.toContain('HERO SECTION');
    expect(result).toContain('TITLE: Title');
  });

  it('truncates output to MAX_CONTENT_CHARS', () => {
    const bigText = 'x'.repeat(10000);
    const result = buildContentForAI('Title', bigText, [], bigText, bigText, bigText, [], bigText);
    expect(result.length).toBeLessThanOrEqual(8100);
  });
});
