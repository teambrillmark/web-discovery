import { CompanyEntity, QueryObject, ValidationResult, SPAM_INDICATORS, CONFIDENCE_THRESHOLDS } from '@discovery/shared';
import { ConfidenceScorer } from './confidence-scorer';

const BLOCKED_DOMAINS = new Set([
  'google.com', 'facebook.com', 'youtube.com', 'twitter.com', 'linkedin.com',
  'instagram.com', 'reddit.com', 'wikipedia.org', 'amazon.com', 'bing.com',
  'yahoo.com', 'pinterest.com', 'tiktok.com', 'snapchat.com',
  // Review/directory sites — crawled for links, not entities
  'clutch.co', 'g2.com', 'capterra.com', 'goodfirms.co', 'trustpilot.com',
  'crunchbase.com', 'producthunt.com', 'growjo.com', 'cbinsights.com',
]);

// Patterns that strongly indicate a self-serve SaaS tool/platform rather than a service agency.
// A company showing 2+ of these in their description is almost certainly a tool, not an agency.
const SAAS_TOOL_SIGNALS: RegExp[] = [
  /free\s*trial/i,
  /\$\d+\s*(?:\/|per)\s*(?:month|mo\b|user|seat)/i,
  /pricing\s*plan/i,
  /sign\s*up\s*(?:for\s*)?free/i,
  /start\s*(?:for\s*)?free/i,
  /per\s*(?:user|seat|month)\b/i,
  /(?:a\/b|split)\s*testing\s*(?:tool|software|platform|solution)/i,
  /heatmap\s*(?:tool|software|platform)/i,
  /session\s*recording\s*(?:tool|software)/i,
  /crm\s*(?:software|platform|tool|system)/i,
  /no-?code\s*(?:tool|platform|builder)/i,
  /run\s*(?:a\/b|split)\s*tests\s*(?:yourself|on your)/i,
  /self-?serve/i,
  /(?:14|30)-day\s*free/i,
];

// Patterns indicating a genuine service agency (consulting, team-based services)
const AGENCY_SERVICE_SIGNALS: RegExp[] = [
  /our\s+(?:team|clients|experts|consultants|specialists)/i,
  /we\s+(?:help|partner\s+with|specialize\s+in|work\s+with)/i,
  /case\s+stud(?:y|ies)/i,
  /managed\s+(?:service|program|cro|experimentation)/i,
  /(?:cro|conversion)\s+(?:consulting|consultancy|agency|audit\s+service)/i,
  /client\s+(?:result|success|portfolio)/i,
  /experimentation\s+program/i,
  /\bagency\b|\bconsultancy\b|\bconsulting\s+firm\b/i,
  /full.?service\s+(?:agency|cro|marketing)/i,
];

// Intents where the tool-vs-agency distinction matters (service provider queries)
const SERVICE_INTENTS = new Set(['agency_search', 'local_business_search']);

// Industry contexts where tools masquerade as competitors to agencies
const TOOL_SENSITIVE_INDUSTRIES = new Set(['cro_agency', 'digital_marketing', 'hr_tech', 'edtech']);

export class Validator {
  private scorer: ConfidenceScorer;

  constructor() {
    this.scorer = new ConfidenceScorer();
  }

  validate(entity: CompanyEntity, queryObj: QueryObject): ValidationResult {
    const reasons: string[] = [];
    const flags: string[] = [];
    let isValid = true;

    // Check blocked domains
    if (BLOCKED_DOMAINS.has(entity.domain)) {
      isValid = false;
      reasons.push('Review/directory site — not a company entity');
      flags.push('irrelevant');
    }

    // Check spam
    const contentToCheck = `${entity.name} ${entity.description ?? ''}`.toLowerCase();
    const spamFound = SPAM_INDICATORS.filter(s => contentToCheck.includes(s));
    if (spamFound.length > 0) {
      isValid = false;
      reasons.push(`Spam indicators found: ${spamFound.join(', ')}`);
      flags.push('spam');
    }

    // Check minimum data
    if (!entity.name || entity.name.length < 2) {
      isValid = false;
      reasons.push('Missing company name');
      flags.push('incomplete');
    }

    if (!entity.domain || !entity.domain.includes('.')) {
      isValid = false;
      reasons.push('Invalid domain');
      flags.push('incomplete');
    }

    // ── Tool-vs-agency discrimination ─────────────────────────────────────
    // Reject SaaS tools when: (a) user explicitly asks for agencies/service providers,
    // OR (b) competitor analysis in a service industry (CRO, digital marketing, etc.)
    // — tools FOR the industry are not SERVICE competitors within it.
    const applyToolRejection =
      SERVICE_INTENTS.has(queryObj.intent) ||
      (queryObj.intent === 'competitor_analysis' &&
        queryObj.industry !== null &&
        TOOL_SENSITIVE_INDUSTRIES.has(queryObj.industry));

    if (isValid && applyToolRejection) {
      const desc = `${entity.description ?? ''} ${entity.metaDescription ?? ''} ${entity.metaTitle ?? ''}`;
      const toolHits = SAAS_TOOL_SIGNALS.filter(p => p.test(desc));
      const agencyHits = AGENCY_SERVICE_SIGNALS.filter(p => p.test(desc));

      if (toolHits.length >= 2 && agencyHits.length === 0) {
        isValid = false;
        reasons.push(`SaaS tool/platform, not a service agency (tool signals: ${toolHits.length})`);
        flags.push('tool_not_agency');
      } else if (toolHits.length >= 3) {
        isValid = false;
        reasons.push(`Self-serve platform detected (${toolHits.length} tool signals override agency signals)`);
        flags.push('tool_not_agency');
      }
    }

    // Soft flag for tool-sensitive industries outside the above check
    if (isValid && !applyToolRejection && queryObj.industry && TOOL_SENSITIVE_INDUSTRIES.has(queryObj.industry)) {
      const desc = `${entity.description ?? ''} ${entity.metaDescription ?? ''} ${entity.metaTitle ?? ''}`;
      const toolHits = SAAS_TOOL_SIGNALS.filter(p => p.test(desc));
      if (toolHits.length >= 3) {
        flags.push('possible_tool_not_agency');
      }
    }

    // Score confidence and relevance
    const { confidence, relevance } = this.scorer.scoreEntity(entity, queryObj);

    if (confidence < CONFIDENCE_THRESHOLDS.MINIMUM) {
      isValid = false;
      reasons.push('Confidence score too low');
      flags.push('low_quality');
    }

    if (relevance < 0.1) {
      isValid = false;
      reasons.push('Not relevant to query');
      flags.push('irrelevant');
    }

    if (isValid && confidence >= CONFIDENCE_THRESHOLDS.HIGH && relevance >= 0.7) {
      flags.push('high_confidence');
    }

    if (isValid && reasons.length === 0) {
      flags.push('verified');
      reasons.push('Passed all validation checks');
    }

    return {
      isValid,
      confidenceScore: confidence,
      relevanceScore: relevance,
      reasons,
      flags: flags as any[],
    };
  }
}
