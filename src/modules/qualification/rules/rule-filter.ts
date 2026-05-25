// Rule-based qualification filter.
//
// WHY rules before AI?
// Rules are O(1) hash lookups — microseconds per domain.
// AI validation is an HTTP round-trip — 1-3 seconds per batch.
// Running AI on meetup.com wastes time and budget. Rules catch the obvious
// rejections cheaply so AI only processes genuinely ambiguous candidates.
//
// Rule categories (in order of application):
//   1. Blocklisted domain — well-known non-competitor entity
//   2. Non-competitor subdomain — auth, CDN, API, docs, etc.
//   3. Suspicious TLD patterns — .gov, .edu suggest non-commercial
//   4. Known documentation hosting patterns

import type { EntityType, QualificationResult } from '../types';
import { isBlocklistedDomain, isSubdomainDomain } from './domain-blocklist';

// TLDs associated with government or educational institutions — not competitors.
const INSTITUTIONAL_TLDS = new Set(['.gov', '.edu', '.mil', '.ac.uk', '.gov.uk']);

// Domain suffixes / patterns that indicate documentation or developer portals.
const DOC_PATTERNS = [
  '.readthedocs.io',
  '.gitbook.io',
  '.github.io',
  '.gitlab.io',
  'apidocs.',
  'developer.',
];

export interface RuleFilterResult {
  passed: boolean;
  result: QualificationResult;
}

export function applyRuleFilter(domain: string): RuleFilterResult {
  // ── 1. Blocklist check ────────────────────────────────────────────────────
  const blocklistCheck = isBlocklistedDomain(domain);
  if (blocklistCheck.blocked) {
    return {
      passed: false,
      result: {
        domain,
        accepted: false,
        classification: domainCategoryToEntityType(blocklistCheck.category),
        relevance: 'irrelevant',
        confidence: 0.98,
        rejectionReason: blocklistCheck.category,
        rejectionStage: 'rule-filter',
      },
    };
  }

  // ── 2. Non-competitor subdomain check ─────────────────────────────────────
  if (isSubdomainDomain(domain)) {
    return {
      passed: false,
      result: {
        domain,
        accepted: false,
        classification: 'infrastructure',
        relevance: 'irrelevant',
        confidence: 0.95,
        rejectionReason: 'non-competitor-subdomain',
        rejectionStage: 'rule-filter',
      },
    };
  }

  // ── 3. Institutional TLD ──────────────────────────────────────────────────
  for (const tld of INSTITUTIONAL_TLDS) {
    if (domain.endsWith(tld)) {
      return {
        passed: false,
        result: {
          domain,
          accepted: false,
          classification: 'media',
          relevance: 'irrelevant',
          confidence: 0.90,
          rejectionReason: 'institutional-domain',
          rejectionStage: 'rule-filter',
        },
      };
    }
  }

  // ── 4. Documentation hosting patterns ────────────────────────────────────
  for (const pattern of DOC_PATTERNS) {
    if (domain.includes(pattern)) {
      return {
        passed: false,
        result: {
          domain,
          accepted: false,
          classification: 'infrastructure',
          relevance: 'irrelevant',
          confidence: 0.92,
          rejectionReason: 'documentation-hosting',
          rejectionStage: 'rule-filter',
        },
      };
    }
  }

  return {
    passed: true,
    result: {
      domain,
      accepted: true,
      classification: 'unknown',  // classifier assigns real type next
      relevance: 'direct',        // optimistic default, AI may revise
      confidence: 0.5,
    },
  };
}

function domainCategoryToEntityType(category: string): EntityType {
  const map: Record<string, EntityType> = {
    'community-platform':         'community',
    'job-board':                  'job-board',
    'app-store':                  'app-store',
    'infrastructure-domain':      'infrastructure',
    'analytics-tracking-tool':    'tool',
    'documentation-site':         'infrastructure',
    'search-engine-or-seo-tool':  'tool',
    'media-publication':          'media',
    'productivity-tool':          'tool',
    'payment-commerce-infra':     'infrastructure',
    'blocklisted-domain':         'unknown',
  };
  return map[category] ?? 'unknown';
}
