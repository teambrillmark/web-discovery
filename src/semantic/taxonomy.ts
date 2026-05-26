import {
  DEFAULT_ONTOLOGY,
  mapToSemanticGroups,
  groupSimilarity,
  type SemanticGroup,
} from './ontology';
import {
  accumulateTaxonomyEvidence,
  type BusinessModelConfidence,
  type ClassificationEvidence,
} from './evidence-classifier';

// ── Multi-dimensional company taxonomy ────────────────────────────────────────
//
// WHY a taxonomy instead of a raw companyType string?
//   companyType from AI extraction is a single string ("Agency", "SaaS") with no
//   structured semantics. A taxonomy normalises these into typed dimensions so we
//   can compute *partial* alignment:
//     Agency  vs Consulting  → 0.70 (both service delivery, similar buyer relationship)
//     Agency  vs SaaS        → 0.30 (complementary but different value proposition)
//     SaaS    vs Platform    → 0.60 (both software, differ in extensibility model)
//
//   Pure boolean businessTypeMatch misses these gradients, causing score cliffs
//   between companies that actually compete for the same budget.

export type BusinessModel =
  | 'Agency'
  | 'Consulting'
  | 'SaaS'
  | 'Platform'
  | 'Tool'
  | 'Marketplace'
  | 'Brand'
  | 'Media'
  | 'Other';

export type DeliveryModel =
  | 'ServiceDelivery'    // custom work, retainers, managed services
  | 'SoftwareDelivery'   // packaged software / SaaS / APIs
  | 'Hybrid'             // both (e.g. software + implementation services)
  | 'ContentDelivery';   // media / publications / education

export type MarketType =
  | 'B2B'
  | 'B2C'
  | 'B2B2C'
  | 'Enterprise'
  | 'SMB'
  | 'Mixed';

export type AudienceScope =
  | 'Niche'       // specific vertical or use case
  | 'Vertical'    // full industry vertical
  | 'Horizontal'  // cross-industry, broad applicability
  | 'Global';     // all of the above at scale

export interface CompanyTaxonomy {
  businessModel: BusinessModel;
  businessModelConfidence: BusinessModelConfidence;  // confidence for each model (0-1 each)
  deliveryModel: DeliveryModel;
  marketType: MarketType;
  audienceScope: AudienceScope;
  primaryGroups: string[];  // ontology group IDs mapped from specialties
}

export type { BusinessModelConfidence } from './evidence-classifier';

// Input shape — accepts the subset of fields needed for classification.
// Using a narrow interface (not CompetitorProfile) avoids importing profiling types.
export interface TaxonomyInput {
  companyType: string | null | undefined;
  primaryCompetitiveIdentity: string | null | undefined;
  primarySpecialties: string[];
  coreServices: string[];
  targetAudience: string[];
}

// ── Classification ─────────────────────────────────────────────────────────────

export function classifyCompanyTaxonomy(
  profile: TaxonomyInput,
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
): CompanyTaxonomy {
  // String-based classification from the AI-extracted companyType field.
  // inferBusinessModel is authoritative for known types — it's the direct intent of the
  // AI that labeled the company. Evidence accumulation supplements it when it returns 'Other'.
  const stringModel = inferBusinessModel(profile.companyType);

  // Evidence accumulator provides:
  //   1. businessModelConfidence — a distribution over all models for observability
  //   2. A fallback businessModel when string inference is 'Other' (null/unknown companyType)
  const evidenceInput: ClassificationEvidence = {
    companyType:                 profile.companyType,
    primaryCompetitiveIdentity:  profile.primaryCompetitiveIdentity,
    coreServices:                profile.coreServices,
    primarySpecialties:          profile.primarySpecialties,
  };
  const { businessModel: evidenceModel, confidence } = accumulateTaxonomyEvidence(evidenceInput);

  // Precedence: string model wins unless it's 'Other', then fall back to evidence.
  const businessModel: BusinessModel = stringModel !== 'Other' ? stringModel : evidenceModel;

  const deliveryModel = inferDeliveryModel(businessModel, profile.primarySpecialties, profile.coreServices);
  const { marketType, audienceScope } = inferMarket(profile.targetAudience, profile.primarySpecialties);

  const textForGroups = [
    ...(profile.primarySpecialties ?? []),
    profile.primaryCompetitiveIdentity ?? '',
    ...(profile.coreServices ?? []).slice(0, 4),
  ];
  const primaryGroups = mapToSemanticGroups(textForGroups, ontology);

  return { businessModel, businessModelConfidence: confidence, deliveryModel, marketType, audienceScope, primaryGroups };
}

// ── Competitive distance ───────────────────────────────────────────────────────
//
// WHY separate from taxonomyAlignment?
//   taxonomyAlignment() blends business model + group overlap + delivery + market.
//   Its group-overlap component means Agency↔SaaS with same specialties scores ~0.53,
//   inflating SaaS tools against agency targets who share the same problem space.
//
//   competitiveDistance() is PURE business-model-to-business-model proximity:
//   "how directly do these two company types compete for the same customer budget?"
//
//   Agency↔Agency = 1.0  — same value proposition, same RFP slot.
//   Agency↔SaaS   = 0.55 — same problem, different mechanism (execution vs software).
//   Agency↔Media  = 0.15 — same ecosystem, almost never the same RFP.
//
//   taxonomyAlignment() is used for observability (matchedSignals.taxonomyAlignment).
//   competitiveDistance() drives the businessTypeMatch scoring component.

export type CompetitiveRelationship = 'direct' | 'adjacent' | 'peripheral';

const COMPETITIVE_DISTANCE: Partial<Record<BusinessModel, Partial<Record<BusinessModel, number>>>> = {
  Agency:      { Agency: 1.00, Consulting: 0.90, SaaS: 0.55, Platform: 0.45, Tool: 0.40, Marketplace: 0.30, Brand: 0.20, Media: 0.15, Other: 0.10 },
  Consulting:  { Consulting: 1.00, Agency: 0.90, SaaS: 0.50, Platform: 0.45, Tool: 0.40, Marketplace: 0.25, Brand: 0.20, Media: 0.20, Other: 0.10 },
  SaaS:        { SaaS: 1.00, Platform: 0.85, Tool: 0.75, Agency: 0.55, Consulting: 0.50, Marketplace: 0.40, Brand: 0.20, Media: 0.15, Other: 0.10 },
  Platform:    { Platform: 1.00, SaaS: 0.85, Tool: 0.70, Marketplace: 0.50, Agency: 0.45, Consulting: 0.45, Brand: 0.20, Media: 0.15, Other: 0.10 },
  Tool:        { Tool: 1.00, SaaS: 0.75, Platform: 0.70, Agency: 0.40, Consulting: 0.40, Marketplace: 0.35, Brand: 0.15, Media: 0.10, Other: 0.10 },
  Marketplace: { Marketplace: 1.00, Platform: 0.50, SaaS: 0.40, Tool: 0.35, Brand: 0.30, Agency: 0.30, Media: 0.20, Consulting: 0.25, Other: 0.10 },
  Brand:       { Brand: 1.00, Marketplace: 0.30, Media: 0.20, Agency: 0.20, Consulting: 0.20, SaaS: 0.20, Platform: 0.20, Tool: 0.15, Other: 0.10 },
  Media:       { Media: 1.00, Brand: 0.20, Marketplace: 0.20, Consulting: 0.20, Agency: 0.15, SaaS: 0.15, Platform: 0.15, Tool: 0.10, Other: 0.10 },
  Other:       { Other: 1.0 },
};

export function competitiveDistance(a: BusinessModel, b: BusinessModel): number {
  if (a === b) return 1.0;
  return COMPETITIVE_DISTANCE[a]?.[b] ?? COMPETITIVE_DISTANCE[b]?.[a] ?? 0.10;
}

// Direct:     same or near-same business model (distance ≥ 0.85) — compete for the same RFP.
// Adjacent:   related model (distance ≥ 0.45) — same problem, different mechanism.
// Peripheral: distant model — same ecosystem, different budget pool.
export function classifyCompetitiveRelationship(
  targetModel: BusinessModel,
  competitorModel: BusinessModel,
  specialtyOverlap: number,
): CompetitiveRelationship {
  const distance = competitiveDistance(targetModel, competitorModel);
  if (distance >= 0.85) return 'direct';
  if (distance >= 0.45) return 'adjacent';
  // Weak business model proximity but strong topic overlap → still adjacent, not peripheral
  if (specialtyOverlap >= 0.5 && distance >= 0.25) return 'adjacent';
  return 'peripheral';
}

// ── Alignment ──────────────────────────────────────────────────────────────────
//
// Returns a 0-1 score representing how much two taxonomies align.
// Kept for observability (matchedSignals.taxonomyAlignment). Scoring now uses
// competitiveDistance() directly via the businessTypeMatch weight slot.

export function taxonomyAlignment(
  a: CompanyTaxonomy,
  b: CompanyTaxonomy,
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
): number {
  // If either profile is completely unclassifiable (no specialties mapped and type=Other),
  // there is no meaningful signal to align on — avoid false similarity from default values.
  const aUnknown = a.businessModel === 'Other' && a.primaryGroups.length === 0;
  const bUnknown = b.businessModel === 'Other' && b.primaryGroups.length === 0;
  if (aUnknown || bUnknown) return 0;

  const bmScore = businessModelAlignment(a.businessModel, b.businessModel);
  const dmScore = deliveryModelAlignment(a.deliveryModel, b.deliveryModel);
  const mtScore = marketTypeAlignment(a.marketType, b.marketType);
  const groupScore = primaryGroupsAlignment(a.primaryGroups, b.primaryGroups, ontology);

  // Weighted blend — group overlap is most diagnostic; business model second.
  return (
    bmScore    * 0.35 +
    groupScore * 0.35 +
    dmScore    * 0.20 +
    mtScore    * 0.10
  );
}

// ── Business model alignment matrix ───────────────────────────────────────────

const BUSINESS_MODEL_ALIGNMENT: Partial<Record<BusinessModel, Partial<Record<BusinessModel, number>>>> = {
  Agency:      { Agency: 1.0, Consulting: 0.70, Hybrid: 0.55, SaaS: 0.30, Platform: 0.25, Tool: 0.20, Marketplace: 0.15, Brand: 0.10, Media: 0.05, Other: 0.10 },
  Consulting:  { Agency: 0.70, Consulting: 1.0, Hybrid: 0.55, SaaS: 0.25, Platform: 0.20, Tool: 0.20, Marketplace: 0.10, Brand: 0.10, Media: 0.10, Other: 0.10 },
  SaaS:        { Agency: 0.30, Consulting: 0.25, SaaS: 1.0, Platform: 0.70, Tool: 0.60, Hybrid: 0.45, Marketplace: 0.25, Brand: 0.15, Media: 0.10, Other: 0.15 },
  Platform:    { Agency: 0.25, Consulting: 0.20, SaaS: 0.70, Platform: 1.0, Tool: 0.55, Hybrid: 0.50, Marketplace: 0.35, Brand: 0.15, Media: 0.10, Other: 0.15 },
  Tool:        { Agency: 0.20, Consulting: 0.20, SaaS: 0.60, Platform: 0.55, Tool: 1.0, Hybrid: 0.40, Marketplace: 0.20, Brand: 0.10, Media: 0.10, Other: 0.10 },
  Marketplace: { Agency: 0.15, Consulting: 0.10, SaaS: 0.25, Platform: 0.35, Tool: 0.20, Marketplace: 1.0, Hybrid: 0.30, Brand: 0.25, Media: 0.15, Other: 0.10 },
  Brand:       { Agency: 0.10, Consulting: 0.10, SaaS: 0.15, Platform: 0.15, Tool: 0.10, Marketplace: 0.25, Brand: 1.0, Media: 0.25, Other: 0.10 },
  Media:       { Agency: 0.10, Consulting: 0.10, SaaS: 0.10, Platform: 0.10, Tool: 0.10, Marketplace: 0.15, Brand: 0.25, Media: 1.0, Other: 0.10 },
  Other:       { Other: 1.0 },
};

function businessModelAlignment(a: BusinessModel, b: BusinessModel): number {
  if (a === b) return 1.0;
  return BUSINESS_MODEL_ALIGNMENT[a]?.[b] ?? BUSINESS_MODEL_ALIGNMENT[b]?.[a] ?? 0.10;
}

// ── Delivery model alignment ───────────────────────────────────────────────────

const DELIVERY_MODEL_ALIGNMENT: Record<DeliveryModel, Record<DeliveryModel, number>> = {
  ServiceDelivery:  { ServiceDelivery: 1.0, Hybrid: 0.60, SoftwareDelivery: 0.25, ContentDelivery: 0.20 },
  SoftwareDelivery: { SoftwareDelivery: 1.0, Hybrid: 0.60, ServiceDelivery: 0.25, ContentDelivery: 0.15 },
  Hybrid:           { Hybrid: 1.0, ServiceDelivery: 0.60, SoftwareDelivery: 0.60, ContentDelivery: 0.20 },
  ContentDelivery:  { ContentDelivery: 1.0, Hybrid: 0.20, ServiceDelivery: 0.20, SoftwareDelivery: 0.15 },
};

function deliveryModelAlignment(a: DeliveryModel, b: DeliveryModel): number {
  return DELIVERY_MODEL_ALIGNMENT[a][b];
}

// ── Market type alignment ──────────────────────────────────────────────────────

const MARKET_TYPE_ALIGNMENT: Record<MarketType, Record<MarketType, number>> = {
  B2B:        { B2B: 1.0, Enterprise: 0.75, SMB: 0.60, B2B2C: 0.50, Mixed: 0.60, B2C: 0.20 },
  Enterprise: { Enterprise: 1.0, B2B: 0.75, SMB: 0.40, B2B2C: 0.45, Mixed: 0.55, B2C: 0.15 },
  SMB:        { SMB: 1.0, B2B: 0.60, Enterprise: 0.40, B2B2C: 0.50, Mixed: 0.55, B2C: 0.30 },
  B2C:        { B2C: 1.0, B2B2C: 0.50, Mixed: 0.50, SMB: 0.30, B2B: 0.20, Enterprise: 0.15 },
  B2B2C:      { B2B2C: 1.0, B2C: 0.50, B2B: 0.50, SMB: 0.50, Mixed: 0.60, Enterprise: 0.45 },
  Mixed:      { Mixed: 1.0, B2B: 0.60, B2C: 0.50, B2B2C: 0.60, SMB: 0.55, Enterprise: 0.55 },
};

function marketTypeAlignment(a: MarketType, b: MarketType): number {
  return MARKET_TYPE_ALIGNMENT[a][b];
}

// ── Primary group overlap ──────────────────────────────────────────────────────
//
// Pairwise max-similarity over ontology groups.
// Each target group finds its best-matching competitor group and averages all best scores.

function primaryGroupsAlignment(
  aGroups: string[],
  bGroups: string[],
  ontology: SemanticGroup[],
): number {
  if (aGroups.length === 0 || bGroups.length === 0) return 0;

  const scores: number[] = aGroups.map((ga) => {
    const bestMatch = Math.max(0, ...bGroups.map((gb) => groupSimilarity(ga, gb, ontology)));
    return bestMatch;
  });

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

// ── Inference helpers ──────────────────────────────────────────────────────────

function inferBusinessModel(companyType: string | null | undefined): BusinessModel {
  if (!companyType) return 'Other';

  const t = companyType.toLowerCase().trim();

  // Exact matches (canonical values from profile.prompt.ts)
  if (t === 'agency')       return 'Agency';
  if (t === 'saas')         return 'SaaS';
  if (t === 'platform')     return 'Platform';
  if (t === 'tool')         return 'Tool';
  if (t === 'marketplace')  return 'Marketplace';
  if (t === 'consulting' || t === 'consultancy') return 'Consulting';
  if (t === 'ecommerce brand' || t === 'brand')  return 'Brand';
  if (t === 'media')        return 'Media';
  if (t === 'other')        return 'Other';

  // Fuzzy fallbacks — handles AI variants like 'eCommerce', 'E-commerce Brand', etc.
  if (t.includes('agency'))                          return 'Agency';
  if (t.includes('consult'))                         return 'Consulting';
  if (t.includes('saas') || t.includes('software'))  return 'SaaS';
  if (t.includes('platform'))                        return 'Platform';
  if (t.includes('tool'))                            return 'Tool';
  if (t.includes('marketplace'))                     return 'Marketplace';
  // ecommerce/brand variants must come before generic 'media' check
  if (t.includes('ecommerce') || t.includes('e-commerce') || t.includes('brand')) return 'Brand';
  if (t.includes('media') || t.includes('publication'))  return 'Media';

  return 'Other';
}

function inferDeliveryModel(
  businessModel: BusinessModel,
  specialties: string[],
  services: string[],
): DeliveryModel {
  // Agency and Consulting always service-delivery
  if (businessModel === 'Agency' || businessModel === 'Consulting') return 'ServiceDelivery';
  // Pure software models
  if (businessModel === 'SaaS' || businessModel === 'Tool') return 'SoftwareDelivery';

  // Platform and Media can be hybrid — check if they also offer services
  const allText = [...specialties, ...services].join(' ').toLowerCase();
  const hasService = ['consulting', 'agency', 'managed', 'services', 'implementation'].some(
    (kw) => allText.includes(kw),
  );
  const hasSoftware = ['software', 'platform', 'api', 'saas', 'app', 'tool'].some(
    (kw) => allText.includes(kw),
  );

  if (hasService && hasSoftware) return 'Hybrid';
  if (hasSoftware) return 'SoftwareDelivery';
  if (hasService) return 'ServiceDelivery';

  if (businessModel === 'Platform') return 'SoftwareDelivery';
  if (businessModel === 'Media')    return 'ContentDelivery';

  return 'ServiceDelivery';
}

function inferMarket(
  targetAudience: string[],
  specialties: string[],
): { marketType: MarketType; audienceScope: AudienceScope } {
  const corpus = [...targetAudience, ...specialties].join(' ').toLowerCase();

  let marketType: MarketType = 'B2B';  // default for most competitive intelligence contexts

  if (corpus.includes('enterprise') && !corpus.includes('smb') && !corpus.includes('small business')) {
    marketType = 'Enterprise';
  } else if (
    corpus.includes('smb') ||
    corpus.includes('small business') ||
    corpus.includes('small and medium')
  ) {
    marketType = 'SMB';
  } else if (corpus.includes('b2c') || corpus.includes('consumer') || corpus.includes('shoppers')) {
    marketType = corpus.includes('b2b') ? 'B2B2C' : 'B2C';
  } else if (corpus.includes('b2b') || corpus.includes('brands') || corpus.includes('marketers')) {
    marketType = 'B2B';
  }

  // AudienceScope: how niche vs broad
  const hasNicheSignal = corpus.includes('ecommerce') || corpus.includes('shopify') ||
    corpus.includes('retail') || corpus.includes('fintech') || corpus.includes('healthcare');
  const hasHorizontalSignal = corpus.includes('all industries') ||
    corpus.includes('any company') || corpus.includes('any business');

  const audienceScope: AudienceScope = hasHorizontalSignal
    ? 'Horizontal'
    : hasNicheSignal
    ? 'Niche'
    : 'Vertical';

  return { marketType, audienceScope };
}
