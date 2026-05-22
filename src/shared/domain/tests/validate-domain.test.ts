import { describe, it, expect } from 'vitest';
import { validateDomain } from '../validate-domain';

describe('validateDomain — valid domains', () => {
  const valid = [
    'example.com',
    'speero.com',
    'convert.io',
    'bbc.co.uk',
    'cro-agency.com',
    '123test.com',
    'a.example.com',
    'sub.domain.example.co.uk',
    'my-company.io',
    'xn--nxasmq6b.com',
  ];

  for (const domain of valid) {
    it(`accepts "${domain}"`, () => {
      expect(validateDomain(domain)).toEqual({ ok: true });
    });
  }
});

describe('validateDomain — reserved / local hostnames', () => {
  it('rejects localhost', () => {
    const r = validateDomain('localhost');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('reserved-hostname');
  });

  it('rejects localdomain', () => {
    expect(validateDomain('localdomain').ok).toBe(false);
  });

  it('rejects local', () => {
    expect(validateDomain('local').ok).toBe(false);
  });
});

describe('validateDomain — IP addresses', () => {
  it('rejects IPv4', () => {
    const r = validateDomain('192.168.1.1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ip-address-not-allowed');
  });

  it('rejects public IPv4', () => {
    expect(validateDomain('8.8.8.8').ok).toBe(false);
  });

  it('rejects private range 10.x', () => {
    expect(validateDomain('10.0.0.1').ok).toBe(false);
  });

  it('rejects loopback 127.x', () => {
    expect(validateDomain('127.0.0.1').ok).toBe(false);
  });

  it('rejects 172.x range', () => {
    expect(validateDomain('172.16.0.1').ok).toBe(false);
  });

  it('rejects 192.168.x', () => {
    expect(validateDomain('192.168.0.1').ok).toBe(false);
  });
});

describe('validateDomain — format rejections', () => {
  it('rejects empty string', () => {
    const r = validateDomain('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty-domain');
  });

  it('rejects bare label without TLD', () => {
    const r = validateDomain('nodot');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-domain-format');
  });

  it('rejects domain with spaces', () => {
    expect(validateDomain('some thing.com').ok).toBe(false);
  });

  it('rejects domain with uppercase letters', () => {
    expect(validateDomain('Example.COM').ok).toBe(false);
  });

  it('rejects domain starting with hyphen', () => {
    expect(validateDomain('-bad.com').ok).toBe(false);
  });

  it('rejects domain ending with hyphen', () => {
    expect(validateDomain('bad-.com').ok).toBe(false);
  });

  it('rejects domain exceeding max length', () => {
    expect(validateDomain('a'.repeat(254)).ok).toBe(false);
  });

  it('rejects trailing dot (normalizeDomain should have removed it before validation)', () => {
    expect(validateDomain('example.com.').ok).toBe(false);
  });

  it('does not throw on any input', () => {
    const inputs = ['', '   ', 'not-a-domain', '!!!', '\n', '0'.repeat(300)];
    for (const input of inputs) {
      expect(() => validateDomain(input)).not.toThrow();
    }
  });
});
