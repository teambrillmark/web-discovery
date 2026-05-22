import { describe, it, expect } from 'vitest';
import { validateDomain } from '../validators/domain.validator';

describe('validateDomain', () => {
  // ── Valid domains ───────────────────────────────────────────────────────────

  it('accepts a standard .com domain', () => {
    expect(validateDomain('speero.com')).toEqual({ ok: true });
  });

  it('accepts a .io domain', () => {
    expect(validateDomain('convert.io')).toEqual({ ok: true });
  });

  it('accepts a .co.uk domain', () => {
    expect(validateDomain('bbc.co.uk')).toEqual({ ok: true });
  });

  it('accepts a hyphenated domain', () => {
    expect(validateDomain('cro-agency.com')).toEqual({ ok: true });
  });

  it('accepts a numeric subdomain segment', () => {
    expect(validateDomain('123test.com')).toEqual({ ok: true });
  });

  it('accepts a two-letter TLD', () => {
    expect(validateDomain('example.io')).toEqual({ ok: true });
  });

  // ── Rejection: localhost / reserved ────────────────────────────────────────

  it('rejects localhost', () => {
    const r = validateDomain('localhost');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('reserved-hostname');
  });

  it('rejects localdomain', () => {
    const r = validateDomain('localdomain');
    expect(r.ok).toBe(false);
  });

  // ── Rejection: IP addresses ─────────────────────────────────────────────────

  it('rejects an IPv4 address', () => {
    const r = validateDomain('192.168.1.1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ip-address-not-allowed');
  });

  it('rejects a public IPv4 address', () => {
    const r = validateDomain('8.8.8.8');
    expect(r.ok).toBe(false);
  });

  it('rejects private range 10.x', () => {
    const r = validateDomain('10.0.0.1');
    expect(r.ok).toBe(false);
  });

  it('rejects loopback 127.x', () => {
    const r = validateDomain('127.0.0.1');
    expect(r.ok).toBe(false);
  });

  // ── Rejection: format ───────────────────────────────────────────────────────

  it('rejects empty string', () => {
    const r = validateDomain('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty-domain');
  });

  it('rejects a bare label with no TLD', () => {
    const r = validateDomain('nodot');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-domain-format');
  });

  it('rejects a domain with spaces', () => {
    expect(validateDomain('some thing.com').ok).toBe(false);
  });

  it('rejects a domain with uppercase letters', () => {
    expect(validateDomain('Speero.COM').ok).toBe(false);
  });

  it('rejects a domain starting with a hyphen', () => {
    expect(validateDomain('-bad.com').ok).toBe(false);
  });

  it('rejects a domain ending with a hyphen', () => {
    expect(validateDomain('bad-.com').ok).toBe(false);
  });

  it('rejects a domain exceeding max length', () => {
    const long = 'a'.repeat(254);
    expect(validateDomain(long).ok).toBe(false);
  });

  it('does not throw on any input', () => {
    const inputs = ['', '   ', 'not-a-domain', '!!!', '\n', '0'.repeat(300)];
    for (const input of inputs) {
      expect(() => validateDomain(input)).not.toThrow();
    }
  });
});
