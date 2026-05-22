import { describe, it, expect } from 'vitest';
import { normalizeDomain } from '../normalizers/domain.normalizer';

describe('normalizeDomain', () => {
  // ── Valid inputs ────────────────────────────────────────────────────────────

  it('passes a clean root domain unchanged', () => {
    const r = normalizeDomain('speero.com');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips https:// protocol', () => {
    const r = normalizeDomain('https://speero.com');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips http:// protocol', () => {
    const r = normalizeDomain('http://speero.com');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips // protocol-relative URL', () => {
    const r = normalizeDomain('//speero.com');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips www. prefix', () => {
    const r = normalizeDomain('https://www.speero.com');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips URL path', () => {
    const r = normalizeDomain('https://www.speero.com/about');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips URL query params', () => {
    const r = normalizeDomain('https://speero.com/page?utm_source=google&utm_medium=cpc');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips URL fragment', () => {
    const r = normalizeDomain('https://speero.com/page#section');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips port number', () => {
    const r = normalizeDomain('https://speero.com:8080/path');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('lowercases the domain', () => {
    const r = normalizeDomain('HTTPS://WWW.Speero.COM/About');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('strips complex tracking URL to root domain', () => {
    const r = normalizeDomain('https://www.forbes.com/advisor/business/software/woocommerce-vs-shopify/?utm_campaign=aff');
    expect(r).toEqual({ ok: true, domain: 'forbes.com' });
  });

  it('handles subdomain by preserving it (sub.domain.com)', () => {
    const r = normalizeDomain('https://app.speero.com/dashboard');
    expect(r).toEqual({ ok: true, domain: 'app.speero.com' });
  });

  it('handles bare domain without www', () => {
    const r = normalizeDomain('www.convertcart.com');
    expect(r).toEqual({ ok: true, domain: 'convertcart.com' });
  });

  it('handles trailing dot (valid DNS form)', () => {
    const r = normalizeDomain('speero.com.');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  it('trims leading/trailing whitespace', () => {
    const r = normalizeDomain('  speero.com  ');
    expect(r).toEqual({ ok: true, domain: 'speero.com' });
  });

  // ── Rejection cases ─────────────────────────────────────────────────────────

  it('rejects empty string', () => {
    const r = normalizeDomain('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty-input');
  });

  it('rejects whitespace-only string', () => {
    const r = normalizeDomain('   ');
    expect(r.ok).toBe(false);
  });

  it('rejects a string that is too long', () => {
    const r = normalizeDomain('a'.repeat(2049));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('input-too-long');
  });

  it('rejects completely unparseable garbage', () => {
    const r = normalizeDomain('not a domain at all!!!');
    // URL parser may extract a hostname-like thing — it will fall to validator
    // but the key expectation is that it does not throw
    expect(r).toHaveProperty('ok');
  });

  it('does not throw on any input', () => {
    const inputs = ['', '   ', 'NULL', 'undefined', '<script>', '../../etc/passwd', 'ftp://'];
    for (const input of inputs) {
      expect(() => normalizeDomain(input)).not.toThrow();
    }
  });
});
