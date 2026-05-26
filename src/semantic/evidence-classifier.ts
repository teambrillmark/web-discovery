// ── Evidence-Based Business Model Classifier ─────────────────────────────────
//
// WHY evidence accumulation instead of single-string classification?
//   inferBusinessModel(companyType) is brittle:
//     • companyType='eCommerce' → 'Other'  (only 'ecommerce brand' was handled)
//     • companyType=null       → 'Other'  (even if services clearly signal 'SaaS')
//   Evidence accumulation looks at ALL available profile fields and returns
//   confidence scores for each BusinessModel. Higher confidence = more evidence.
//
// WHY confidence scores instead of a single type?
//   A company that is "75% Agency, 25% SaaS" (a platform with an agency arm) is
//   classified more accurately as Agency (top model) but the 0.25 SaaS signal
//   avoids penalising taxonomy alignment against SaaS competitors.
//
// DESIGN:
//   Each evidence source contributes votes to each BusinessModel.
//   Votes are weighted by source reliability:
//     companyType string:   3.0 (AI-extracted, purpose-built signal)
//     competitive identity: 2.0 (self-positioning, highly precise)
//     core services:        1.5 (concrete deliverables)
//     specialties:          1.0 (claimed expertise)
//     niche / positioning:  0.5 (verbose, less precise)
//
//   Final confidence is normalized so all models sum to 1.0.
//   'Other' acts as a catch-all with a small floor vote so it is never 0.

import type { BusinessModel } from './taxonomy';

export interface ClassificationEvidence {
  companyType?: string | null;
  primaryCompetitiveIdentity?: string | null;
  coreServices?: string[];
  primarySpecialties?: string[];
  niche?: string | null;
  positioning?: string | null;
  targetAudience?: string[];
}

export type BusinessModelConfidence = Record<BusinessModel, number>;

export interface EvidenceClassification {
  businessModel: BusinessModel;       // highest-confidence model
  topScore: number;                   // normalized confidence of top model (0-1)
  confidence: BusinessModelConfidence;
  evidenceLog: string[];              // human-readable WHY (for logs/debugging)
}

// ── Keyword evidence tables ───────────────────────────────────────────────────
// Each entry: [keyword, vote_weight]
// Longer/more specific phrases carry higher weight.

type KW = [phrase: string, weight: number];

const AGENCY_KW: KW[] = [
  ['agency', 2.0], ['agence', 2.0], ['agentur', 2.0],
  ['consulting', 1.5], ['consultancy', 1.5], ['consultant', 1.0],
  ['managed service', 1.0], ['professional service', 0.8], ['retainer', 0.8],
  ['implementation service', 0.8], ['we help', 0.3], ['our team', 0.2],
];

const CONSULTING_KW: KW[] = [
  ['management consulting', 2.0], ['consulting firm', 2.0],
  ['consulting', 1.5], ['consultancy', 1.5], ['advisory', 1.5], ['advisor', 1.0],
  ['strategic advisory', 1.5], ['strategy consulting', 1.5],
];

const SAAS_KW: KW[] = [
  ['saas', 2.0], ['software as a service', 2.0], ['cloud software', 1.5],
  ['software platform', 1.5], ['software', 1.0], ['application', 0.5],
  ['subscription', 0.5], ['dashboard', 0.5], ['api access', 0.8],
];

const PLATFORM_KW: KW[] = [
  ['platform', 2.0], ['infrastructure', 1.5], ['ecosystem', 1.5],
  ['developer tools', 1.5], ['developer platform', 2.0], ['sdk', 1.0],
  ['api platform', 1.5], ['marketplace platform', 1.5],
];

const TOOL_KW: KW[] = [
  ['tool', 2.0], ['browser extension', 2.0], ['chrome extension', 2.0],
  ['extension', 1.5], ['plugin', 1.5], ['widget', 1.0], ['script', 0.5],
];

const MARKETPLACE_KW: KW[] = [
  ['marketplace', 2.0], ['two-sided marketplace', 2.0],
  ['listing marketplace', 1.5], ['exchange', 1.0],
  ['connect buyers', 1.0], ['connect sellers', 1.0],
];

const BRAND_KW: KW[] = [
  ['ecommerce brand', 2.0], ['d2c brand', 2.0], ['dtc brand', 2.0],
  ['direct to consumer', 1.5], ['direct-to-consumer', 1.5],
  ['ecommerce', 1.0], ['shopify', 1.0], ['woocommerce', 1.0],
  ['online store', 0.8], ['brand', 0.5], ['retail', 0.5],
];

const MEDIA_KW: KW[] = [
  ['media company', 2.0], ['media publication', 2.0], ['publication', 2.0],
  ['editorial', 1.5], ['media', 1.5], ['news', 1.0], ['blog', 0.8],
  ['podcast', 0.8], ['content publisher', 1.5],
];

const MODEL_KW: Record<BusinessModel, KW[]> = {
  Agency:      AGENCY_KW,
  Consulting:  CONSULTING_KW,
  SaaS:        SAAS_KW,
  Platform:    PLATFORM_KW,
  Tool:        TOOL_KW,
  Marketplace: MARKETPLACE_KW,
  Brand:       BRAND_KW,
  Media:       MEDIA_KW,
  Other:       [],
};

// ── Source weight constants ───────────────────────────────────────────────────

const SOURCE_WEIGHT = {
  companyType: 3.0,
  identity:    2.0,
  services:    1.5,
  specialties: 1.0,
  niche:       0.5,
  positioning: 0.3,
};

// ── Core accumulator ─────────────────────────────────────────────────────────

export function accumulateTaxonomyEvidence(
  evidence: ClassificationEvidence,
): EvidenceClassification {
  const rawVotes: Partial<Record<BusinessModel, number>> = {};
  const evidenceLog: string[] = [];

  // companyType string — highest weight
  if (evidence.companyType) {
    const corpus = evidence.companyType.toLowerCase().trim();
    applyVotes(corpus, SOURCE_WEIGHT.companyType, rawVotes, evidenceLog, 'companyType');
  }

  // competitive identity
  if (evidence.primaryCompetitiveIdentity) {
    const corpus = evidence.primaryCompetitiveIdentity.toLowerCase();
    applyVotes(corpus, SOURCE_WEIGHT.identity, rawVotes, evidenceLog, 'identity');
  }

  // core services corpus
  if (evidence.coreServices?.length) {
    const corpus = evidence.coreServices.join(' ').toLowerCase();
    applyVotes(corpus, SOURCE_WEIGHT.services, rawVotes, evidenceLog, 'services');
  }

  // specialties corpus
  if (evidence.primarySpecialties?.length) {
    const corpus = evidence.primarySpecialties.join(' ').toLowerCase();
    applyVotes(corpus, SOURCE_WEIGHT.specialties, rawVotes, evidenceLog, 'specialties');
  }

  // niche
  if (evidence.niche) {
    const corpus = evidence.niche.toLowerCase();
    applyVotes(corpus, SOURCE_WEIGHT.niche, rawVotes, evidenceLog, 'niche');
  }

  // positioning
  if (evidence.positioning) {
    const corpus = evidence.positioning.toLowerCase();
    applyVotes(corpus, SOURCE_WEIGHT.positioning, rawVotes, evidenceLog, 'positioning');
  }

  // 'Other' floor vote — ensures it always has SOME probability so normalization works
  rawVotes['Other'] = (rawVotes['Other'] ?? 0) + 0.1;

  const confidence = normalizeVotes(rawVotes);
  const [businessModel, topScore] = topEntry(confidence);

  return { businessModel, topScore, confidence, evidenceLog };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyVotes(
  corpus: string,
  sourceWeight: number,
  votes: Partial<Record<BusinessModel, number>>,
  log: string[],
  sourceName: string,
): void {
  const ALL_MODELS: BusinessModel[] = ['Agency', 'Consulting', 'SaaS', 'Platform', 'Tool', 'Marketplace', 'Brand', 'Media'];

  for (const model of ALL_MODELS) {
    const kws = MODEL_KW[model];
    for (const [phrase, kw_weight] of kws) {
      if (corpus.includes(phrase)) {
        const vote = sourceWeight * kw_weight;
        votes[model] = (votes[model] ?? 0) + vote;
        log.push(`${sourceName}:"${phrase}" → ${model} +${vote.toFixed(1)}`);
      }
    }
  }
}

function normalizeVotes(
  votes: Partial<Record<BusinessModel, number>>,
): BusinessModelConfidence {
  const ALL_MODELS: BusinessModel[] = ['Agency', 'Consulting', 'SaaS', 'Platform', 'Tool', 'Marketplace', 'Brand', 'Media', 'Other'];
  const total = ALL_MODELS.reduce((s, m) => s + (votes[m] ?? 0), 0);

  const result = {} as BusinessModelConfidence;
  for (const m of ALL_MODELS) {
    result[m] = total > 0 ? Math.round(((votes[m] ?? 0) / total) * 100) / 100 : 0;
  }
  return result;
}

function topEntry(confidence: BusinessModelConfidence): [BusinessModel, number] {
  let topModel: BusinessModel = 'Other';
  let topScore = 0;
  for (const [model, score] of Object.entries(confidence) as [BusinessModel, number][]) {
    if (score > topScore) {
      topScore = score;
      topModel = model;
    }
  }
  return [topModel, topScore];
}
