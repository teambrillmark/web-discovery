import { describe, expect, it } from 'vitest';
import { normalizeDomain, extractHostname, stripWwwPrefix } from '../normalize-domain';

// ─────────────────────────────────────────────────────────────────────────────
// The canonical identity suite.
// Every case here must produce exactly "example.com" — that is the contract.
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeDomain — canonical identity suite', () => {
  const CANONICAL = 'example.com';
  const canonical: string[] = [
    'example.com',
    'EXAMPLE.COM',
    'Example.Com',
    'www.example.com',
    'WWW.EXAMPLE.COM',
    'https://example.com',
    'http://example.com',
    'https://www.example.com',
    'https://www.example.com/',
    'https://www.example.com/path',
    'https://www.example.com/path/',
    'https://example.com?x=1',
    'https://example.com/#fragment',
    'https://example.com/page?utm=source#section',
    'example.com.',
    'example.com....',
    'www.example.com.',
    'https://www.example.com.',
    '//example.com',
    '//www.example.com',
    'example.com:443',
    'example.com:8080',
    'https://example.com:443',
    '  example.com  ',
    '  https://www.example.com/  ',
  ];

  for (const input of canonical) {
    it(`normalizes "${input}" → "${CANONICAL}"`, () => {
      const result = normalizeDomain(input);
      expect(result).toEqual({ ok: true, domain: CANONICAL });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Preserve subdomains (only www is stripped)
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeDomain — subdomain handling', () => {
  it('preserves non-www subdomains', () => {
    expect(normalizeDomain('app.example.com')).toEqual({ ok: true, domain: 'app.example.com' });
  });

  it('preserves multi-level subdomains', () => {
    expect(normalizeDomain('a.b.example.com')).toEqual({ ok: true, domain: 'a.b.example.com' });
  });

  it('strips only www from www.sub.example.com → sub.example.com', () => {
    expect(normalizeDomain('www.sub.example.com')).toEqual({ ok: true, domain: 'sub.example.com' });
  });

  it('does not strip non-www prefix wwwX.example.com', () => {
    expect(normalizeDomain('www2.example.com')).toEqual({ ok: true, domain: 'www2.example.com' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rejection cases — must never throw, must return ok:false
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeDomain — rejection cases', () => {
  it('rejects empty string', () => {
    const r = normalizeDomain('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty-input');
  });

  it('rejects whitespace-only string', () => {
    const r = normalizeDomain('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty-input');
  });

  it('rejects input exceeding max length', () => {
    const r = normalizeDomain('a'.repeat(2049));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('input-too-long');
  });

  it('rejects bare protocol with no host', () => {
    const r = normalizeDomain('https://');
    expect(r.ok).toBe(false);
  });

  it('does not throw on any pathological input', () => {
    const inputs = [
      '', '   ', 'NULL', 'undefined', '<script>alert(1)</script>',
      '../../etc/passwd', 'ftp://', '\n\t', '0'.repeat(3000),
    ];
    for (const input of inputs) {
      expect(() => normalizeDomain(input)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractHostname
// ─────────────────────────────────────────────────────────────────────────────
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

  it('handles URL with path and query string', () => {
    expect(extractHostname('example.com/some/path?foo=bar')).toBe('example.com');
  });

  it('throws for empty string', () => {
    expect(() => extractHostname('')).toThrow();
  });

  it('throws for whitespace-only string', () => {
    expect(() => extractHostname('   ')).toThrow();
  });

  it('throws for bare protocol with no host', () => {
    expect(() => extractHostname('https://')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stripWwwPrefix
// ─────────────────────────────────────────────────────────────────────────────
describe('stripWwwPrefix', () => {
  it('removes www. prefix', () => {
    expect(stripWwwPrefix('www.example.com')).toBe('example.com');
  });

  it('does not strip non-www subdomains', () => {
    expect(stripWwwPrefix('blog.example.com')).toBe('blog.example.com');
  });

  it('does not modify bare domain', () => {
    expect(stripWwwPrefix('example.com')).toBe('example.com');
  });

  it('strips only the leading www., leaving inner www', () => {
    expect(stripWwwPrefix('www.www.example.com')).toBe('www.example.com');
  });
});
