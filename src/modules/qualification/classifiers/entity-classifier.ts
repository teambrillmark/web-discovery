// Lightweight entity type classification from domain name patterns.
//
// WHY pattern-based classification?
// We want to give the AI a head start by pre-labeling obvious categories.
// This also provides a fallback classification for rule-filtered rejections
// where we don't invoke AI at all.
//
// This is NOT deep profiling — we don't crawl the website.
// It uses the domain name and TLD as weak signals only.
// "Unknown" is a valid result and means "AI should decide."

import type { EntityType } from '../types';

// Domain name fragments that strongly suggest an entity type.
// Order within each array matters — earlier matches win.

// Only include terms that strongly and specifically identify an agency/consultancy.
// Short tokens ('cro', 'ux') and broad terms ('growth', 'digital', 'testing') cause
// false positives on compound names like "cronetwork", "digitalsomething", etc.
const AGENCY_FRAGMENTS = [
  'agency', 'agence', 'agentur',
  'consulting', 'consultancy',
  'studio', 'labs', 'lab', 'partners',
  'optimization', 'optimisation',
  'conversion-rate', 'cro-agency',
];

const SAAS_FRAGMENTS = [
  'platform', 'suite', 'hub', 'cloud',
  'software', 'app', 'apps', 'system', 'systems',
  'analytics', 'insights', 'data', 'metrics', 'reporting',
  'automation', 'automate',
];
// NOTE: 'io' and 'ai' are intentionally excluded — they match as substrings in
// words like "conversion" and "email". TLD-based SaaS hints are handled via SAAS_TLDS.

const MARKETPLACE_FRAGMENTS = [
  'marketplace', 'market', 'exchange', 'store', 'shop',
  'compare', 'comparison', 'vs', 'versus',
];

const DIRECTORY_FRAGMENTS = [
  'directory', 'list', 'listing', 'listings',
  'guide', 'database', 'registry', 'index',
  'best', 'top', 'rank', 'ranking', 'rated',
  'reviews', 'review',
];

const COMMUNITY_FRAGMENTS = [
  'community', 'forum', 'forums', 'network', 'club',
  'association', 'society', 'group', 'guild',
  'meetup', 'event', 'events', 'conf', 'summit',
];

const MEDIA_FRAGMENTS = [
  'blog', 'news', 'media', 'magazine', 'journal',
  'post', 'press', 'pub', 'publication',
  'podcast', 'cast',
];

const ECOMMERCE_FRAGMENTS = [
  'shop', 'store', 'ecommerce', 'commerce', 'retail',
  'cart', 'checkout', 'buy', 'sell',
];

// TLDs that lean toward SaaS (commonly used by tech startups).
const SAAS_TLDS = new Set(['.io', '.ai', '.co', '.tech', '.dev', '.app', '.cloud']);

export function classifyEntityType(domain: string): EntityType {
  const lower = domain.toLowerCase();
  const labels = lower.split('.');
  const tld = labels.length >= 2 ? `.${labels.slice(-1)[0]}` : '';
  // The "name" part is everything before the TLD (joined for fragment search).
  const namePart = labels.slice(0, -1).join('');

  // Exact name-fragment matching.
  // Community/directory/marketplace fragments take priority — they describe what the site
  // *is* (a forum, a directory, a comparison tool) regardless of what niche it serves.
  // Agency is checked after so "optimizationforum" → community, not agency.
  if (containsFragment(namePart, COMMUNITY_FRAGMENTS))   return 'community';
  if (containsFragment(namePart, DIRECTORY_FRAGMENTS))   return 'directory';
  if (containsFragment(namePart, MARKETPLACE_FRAGMENTS)) return 'marketplace';
  if (containsFragment(namePart, ECOMMERCE_FRAGMENTS))   return 'ecommerce';
  if (containsFragment(namePart, MEDIA_FRAGMENTS))       return 'media';
  if (containsFragment(namePart, AGENCY_FRAGMENTS))      return 'agency';
  if (containsFragment(namePart, SAAS_FRAGMENTS))        return 'saas';

  // TLD hint for SaaS
  if (SAAS_TLDS.has(tld)) return 'saas';

  return 'unknown';
}

function containsFragment(name: string, fragments: string[]): boolean {
  return fragments.some((f) => name.includes(f));
}
