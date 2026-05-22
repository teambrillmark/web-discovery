import {
  normalizeDomain as _normalizeDomain,
  validateDomain as _validateDomain,
} from '../../../shared/domain';
import { InvalidDomainError } from '../types';

// ── Public helpers (used by tests and callers directly) ───────────────────────

export function extractHostname(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidDomainError('Query cannot be empty');

  let urlString: string;
  if (/^https?:\/\//i.test(trimmed)) {
    urlString = trimmed;
  } else if (trimmed.startsWith('//')) {
    urlString = `https:${trimmed}`;
  } else {
    urlString = `https://${trimmed}`;
  }

  let hostname: string;
  try {
    hostname = new URL(urlString).hostname;
  } catch {
    throw new InvalidDomainError(`Cannot parse as URL: "${input}"`);
  }

  if (!hostname) throw new InvalidDomainError(`No hostname found in: "${input}"`);

  return hostname.toLowerCase();
}

export function stripWwwPrefix(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

export function validateDomainFormat(domain: string): void {
  const outcome = _validateDomain(domain);
  if (!outcome.ok) {
    throw new InvalidDomainError(
      `Invalid domain format: "${domain}". Must be a valid public domain (e.g. example.com).`,
    );
  }
}

// ── Main normalization entry point ────────────────────────────────────────────

/**
 * Normalizes and validates a domain for use at the query-engine API boundary.
 * Throws InvalidDomainError on any failure — use the shared normalizeDomain
 * directly for batch/safe contexts where throwing is not appropriate.
 */
export function normalizeDomain(input: string): string {
  const normOutcome = _normalizeDomain(input);
  if (!normOutcome.ok) {
    throw new InvalidDomainError(
      `Cannot parse domain: "${input}". Reason: ${normOutcome.reason}`,
    );
  }

  const valOutcome = _validateDomain(normOutcome.domain);
  if (!valOutcome.ok) {
    throw new InvalidDomainError(
      `Invalid domain format: "${normOutcome.domain}". Must be a valid public domain (e.g. example.com).`,
    );
  }

  return normOutcome.domain;
}
