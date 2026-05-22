import { describe, expect, it } from 'vitest';
import {
  extractHostname,
  normalizeDomain,
  stripWwwPrefix,
  validateDomainFormat,
} from '../utils/domainUtils';
import { InvalidDomainError } from '../types';

describe('extractHostname', () => {
  it('extracts hostname from full HTTPS URL', () => {
    expect(extractHostname('https://www.example.com/path?q=1#hash')).toBe('www.example.com');
  });

  it('extracts hostname from HTTP URL', () => {
    expect(extractHostname('http://example.com')).toBe('example.com');
  });

  it('lowercases uppercase protocol and host', () => {
    expect(extractHostname('HTTPS://WWW.EXAMPLE.COM')).toBe('www.example.com');
  });

  it('prepends https:// when no protocol is given', () => {
    expect(extractHostname('example.com')).toBe('example.com');
  });

  it('handles protocol-relative URL', () => {
    expect(extractHostname('//example.com')).toBe('example.com');
  });

  it('strips port from hostname', () => {
    expect(extractHostname('example.com:8080')).toBe('example.com');
  });

  it('handles URL with path and query string only', () => {
    expect(extractHostname('example.com/some/path?foo=bar')).toBe('example.com');
  });

  it('throws InvalidDomainError for empty string', () => {
    expect(() => extractHostname('')).toThrow(InvalidDomainError);
  });

  it('throws InvalidDomainError for whitespace-only string', () => {
    expect(() => extractHostname('   ')).toThrow(InvalidDomainError);
  });

  it('throws InvalidDomainError for bare protocol with no host', () => {
    expect(() => extractHostname('https://')).toThrow(InvalidDomainError);
  });
});

describe('stripWwwPrefix', () => {
  it('removes www. prefix', () => {
    expect(stripWwwPrefix('www.example.com')).toBe('example.com');
  });

  it('does not strip non-www subdomains', () => {
    expect(stripWwwPrefix('blog.example.com')).toBe('blog.example.com');
  });

  it('does not modify domains without subdomain', () => {
    expect(stripWwwPrefix('example.com')).toBe('example.com');
  });

  it('only strips the first www.', () => {
    expect(stripWwwPrefix('www.www.example.com')).toBe('www.example.com');
  });
});

describe('validateDomainFormat', () => {
  it('passes for a standard domain', () => {
    expect(() => validateDomainFormat('example.com')).not.toThrow();
  });

  it('passes for multi-level TLD', () => {
    expect(() => validateDomainFormat('example.co.uk')).not.toThrow();
  });

  it('passes for hyphenated domain', () => {
    expect(() => validateDomainFormat('my-company.com')).not.toThrow();
  });

  it('throws for IP address', () => {
    expect(() => validateDomainFormat('192.168.1.1')).toThrow(InvalidDomainError);
  });

  it('throws for localhost (no TLD)', () => {
    expect(() => validateDomainFormat('localhost')).toThrow(InvalidDomainError);
  });

  it('throws for domain with uppercase letters', () => {
    expect(() => validateDomainFormat('EXAMPLE.COM')).toThrow(InvalidDomainError);
  });

  it('throws for domain starting with hyphen', () => {
    expect(() => validateDomainFormat('-example.com')).toThrow(InvalidDomainError);
  });

  it('throws for TLD shorter than 2 characters', () => {
    expect(() => validateDomainFormat('example.c')).toThrow(InvalidDomainError);
  });
});

describe('normalizeDomain', () => {
  it('normalizes full URL with www and path', () => {
    expect(normalizeDomain('https://www.shopify.com/features?ref=nav')).toBe('shopify.com');
  });

  it('normalizes bare domain', () => {
    expect(normalizeDomain('shopify.com')).toBe('shopify.com');
  });

  it('normalizes domain with port', () => {
    expect(normalizeDomain('shopify.com:443')).toBe('shopify.com');
  });

  it('normalizes uppercase URL', () => {
    expect(normalizeDomain('HTTPS://WWW.SHOPIFY.COM')).toBe('shopify.com');
  });

  it('normalizes protocol-relative URL', () => {
    expect(normalizeDomain('//www.shopify.com')).toBe('shopify.com');
  });

  it('does not strip non-www subdomains', () => {
    expect(normalizeDomain('https://blog.shopify.com')).toBe('blog.shopify.com');
  });

  it('throws InvalidDomainError for empty input', () => {
    expect(() => normalizeDomain('')).toThrow(InvalidDomainError);
  });

  it('throws InvalidDomainError for bare word with no TLD', () => {
    expect(() => normalizeDomain('shopify')).toThrow(InvalidDomainError);
  });

  it('throws InvalidDomainError for IP address input', () => {
    expect(() => normalizeDomain('https://192.168.1.1')).toThrow(InvalidDomainError);
  });

  it('throws InvalidDomainError for localhost', () => {
    expect(() => normalizeDomain('localhost')).toThrow(InvalidDomainError);
  });
});
