import type { ValidationOutcome } from './domain.types';

// RFC 1035 / RFC 1123: labels are ASCII alphanumeric + hyphen, TLD >= 2 alpha chars.
const DOMAIN_REGEX = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

// IPv4 pattern (e.g. 192.168.1.1)
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

// Private / reserved IPv4 ranges that must not appear as competitor domains
const PRIVATE_PREFIXES = ['10.', '172.', '192.168.', '127.', '0.'];

// RFC 1035 §2.3.4 — total domain name ≤ 253 octets
const MAX_DOMAIN_LENGTH = 253;

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localdomain', 'local']);

/**
 * Canonical domain validation. ONE implementation used everywhere.
 *
 * Validates a normalized domain string (output of normalizeDomain).
 * Returns ok:false with a human-readable reason instead of throwing.
 */
export function validateDomain(domain: string): ValidationOutcome {
  if (!domain) return { ok: false, reason: 'empty-domain' };

  if (domain.length > MAX_DOMAIN_LENGTH) return { ok: false, reason: 'domain-exceeds-max-length' };

  if (BLOCKED_HOSTNAMES.has(domain)) return { ok: false, reason: 'reserved-hostname' };

  if (IPV4_REGEX.test(domain)) return { ok: false, reason: 'ip-address-not-allowed' };

  for (const prefix of PRIVATE_PREFIXES) {
    if (domain.startsWith(prefix)) return { ok: false, reason: 'private-ip-range' };
  }

  if (!DOMAIN_REGEX.test(domain)) return { ok: false, reason: 'invalid-domain-format' };

  return { ok: true };
}
