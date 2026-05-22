import type { NormalizationOutcome } from './domain.types';

const MAX_INPUT_LENGTH = 2048;

/**
 * Canonical domain normalization. ONE implementation used everywhere.
 *
 * Handles: protocols, www, trailing dots, paths, query params, fragments,
 * ports, mixed casing, whitespace, protocol-relative URLs.
 *
 * Returns ok:false instead of throwing so batch callers stay safe.
 * Use the module-specific wrappers (query-engine) if you need throwing behavior.
 */
export function normalizeDomain(raw: string): NormalizationOutcome {
  const trimmed = raw.trim();

  if (!trimmed) return { ok: false, reason: 'empty-input' };
  if (trimmed.length > MAX_INPUT_LENGTH) return { ok: false, reason: 'input-too-long' };

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
    return { ok: false, reason: 'unparseable-url' };
  }

  if (!hostname) return { ok: false, reason: 'no-hostname-extracted' };

  // lowercase + strip www + strip all trailing dots (valid DNS form but not a useful identity key)
  const domain = hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.+$/, '');

  if (!domain) return { ok: false, reason: 'empty-after-normalization' };

  return { ok: true, domain };
}

// Named helpers kept for callers that need the extraction step independently.
// Both functions mirror the behavior of normalizeDomain's internal pipeline.

export function extractHostname(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Input cannot be empty');

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
    throw new Error(`Cannot parse as URL: "${input}"`);
  }

  if (!hostname) throw new Error(`No hostname found in: "${input}"`);

  return hostname.toLowerCase();
}

export function stripWwwPrefix(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}
