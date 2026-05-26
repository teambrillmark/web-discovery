export interface SemanticGroup {
  id: string;
  label: string;
  synonyms: string[];       // lowercase phrases to match against text
  acronyms: string[];       // short tokens (3-4 chars) to match against domain slugs
  relatedGroups: { id: string; similarity: number }[];  // 0-1 overlap weight
  // ── Semantic hierarchy ────────────────────────────────────────────────────
  // WHY add hierarchy here?
  //   relatedGroups captures peer similarity (both are siblings in the same domain).
  //   parentGroup / childGroups capture IS-A and CONTAINS relationships:
  //     eCommerce CRO is a sub-discipline of CRO → parentGroup = 'CRO'
  //     UX Research is closely related to CRO (sibling) → relatedGroups
  //   The hierarchy is metadata for explainability and future scoring refinements.
  //   It does NOT override relatedGroups similarity values — those take precedence.
  parentGroup?: string;     // ID of the broader concept this group specialises
  childGroups?: string[];   // IDs of more specific sub-disciplines
}

export type OntologyGroupId =
  | 'EXPERIMENTATION'
  | 'CRO'
  | 'PERSONALIZATION'
  | 'UX_RESEARCH'
  | 'ANALYTICS'
  | 'SEO'
  | 'PPC_SEM'
  | 'EMAIL_MARKETING'
  | 'CONTENT_MARKETING'
  | 'GROWTH_MARKETING'
  | 'ECOMMERCE_OPTIMIZATION'
  | 'SAAS_PRODUCT'
  | 'MARTECH';

export const DEFAULT_ONTOLOGY: SemanticGroup[] = [
  {
    id: 'EXPERIMENTATION',
    label: 'Experimentation / A/B Testing',
    synonyms: [
      'a/b testing', 'ab testing', 'split testing', 'multivariate testing',
      'mvt', 'experimentation', 'experiment platform', 'feature flagging',
      'feature flags', 'feature experimentation', 'statistical significance',
      'hypothesis testing', 'test and learn', 'controlled experiments',
    ],
    acronyms: ['abt', 'mvt'],
    relatedGroups: [
      { id: 'CRO',              similarity: 0.75 },
      { id: 'PERSONALIZATION',  similarity: 0.50 },
      { id: 'ANALYTICS',        similarity: 0.35 },
      { id: 'GROWTH_MARKETING', similarity: 0.45 },
    ],
  },
  {
    id: 'CRO',
    label: 'Conversion Rate Optimization',
    synonyms: [
      'conversion rate optimization', 'cro', 'conversion optimization',
      'landing page optimization', 'checkout optimization', 'funnel optimization',
      'conversion audit', 'conversion strategy', 'revenue optimization',
      'conversion consulting', 'ux optimization', 'checkout cro',
    ],
    acronyms: ['cro'],
    relatedGroups: [
      { id: 'EXPERIMENTATION',         similarity: 0.75 },
      { id: 'UX_RESEARCH',             similarity: 0.50 },
      { id: 'ANALYTICS',               similarity: 0.40 },
      { id: 'PERSONALIZATION',         similarity: 0.40 },
      { id: 'ECOMMERCE_OPTIMIZATION',  similarity: 0.55 },
    ],
    childGroups: ['ECOMMERCE_OPTIMIZATION'],
  },
  {
    id: 'PERSONALIZATION',
    label: 'Personalization',
    synonyms: [
      'personalization', 'personalisation', 'website personalization',
      'dynamic content', 'dynamic experiences', 'behavioral targeting',
      'user segmentation', 'content personalization', 'product recommendations',
      'one-to-one marketing', 'adaptive content',
    ],
    acronyms: [],
    relatedGroups: [
      { id: 'EXPERIMENTATION',  similarity: 0.50 },
      { id: 'CRO',              similarity: 0.40 },
      { id: 'MARTECH',          similarity: 0.35 },
      { id: 'ANALYTICS',        similarity: 0.30 },
    ],
  },
  {
    id: 'UX_RESEARCH',
    label: 'UX Research / User Experience',
    synonyms: [
      'ux research', 'user research', 'usability testing', 'user testing',
      'user experience design', 'ux design', 'ui/ux', 'ui ux',
      'interaction design', 'customer experience', 'cx strategy',
      'journey mapping', 'heuristic evaluation', 'user interviews',
      'eye tracking', 'session recording', 'heatmaps',
    ],
    acronyms: ['ux', 'cx'],
    relatedGroups: [
      { id: 'CRO',              similarity: 0.50 },
      { id: 'EXPERIMENTATION',  similarity: 0.35 },
      { id: 'ANALYTICS',        similarity: 0.30 },
    ],
  },
  {
    id: 'ANALYTICS',
    label: 'Analytics / Data',
    synonyms: [
      'analytics', 'web analytics', 'product analytics', 'data analytics', 'digital analytics',
      'business intelligence', 'bi', 'data science', 'data engineering',
      'tracking implementation', 'measurement strategy', 'attribution modeling',
      'google analytics', 'mixpanel', 'amplitude', 'segment', 'data visualization',
      'reporting dashboards', 'kpi tracking',
    ],
    acronyms: [],
    relatedGroups: [
      { id: 'EXPERIMENTATION',  similarity: 0.35 },
      { id: 'CRO',              similarity: 0.40 },
      { id: 'MARTECH',          similarity: 0.35 },
      { id: 'GROWTH_MARKETING', similarity: 0.30 },
    ],
  },
  {
    id: 'SEO',
    label: 'SEO / Organic Search',
    synonyms: [
      'seo', 'search engine optimization', 'organic search', 'technical seo',
      'on-page seo', 'off-page seo', 'link building', 'content seo',
      'local seo', 'enterprise seo', 'seo audit', 'keyword research',
      'search visibility',
    ],
    acronyms: ['seo'],
    relatedGroups: [
      { id: 'CONTENT_MARKETING', similarity: 0.50 },
      { id: 'PPC_SEM',           similarity: 0.40 },
      { id: 'ANALYTICS',         similarity: 0.30 },
    ],
  },
  {
    id: 'PPC_SEM',
    label: 'PPC / Paid Search & Advertising',
    synonyms: [
      'ppc', 'paid search', 'paid advertising', 'google ads', 'search ads',
      'display advertising', 'programmatic advertising', 'paid media',
      'performance marketing', 'social ads', 'facebook ads', 'retargeting',
      'sem', 'search engine marketing', 'biddable media',
    ],
    acronyms: ['ppc', 'sem'],
    relatedGroups: [
      { id: 'SEO',               similarity: 0.40 },
      { id: 'ANALYTICS',         similarity: 0.30 },
      { id: 'GROWTH_MARKETING',  similarity: 0.35 },
    ],
  },
  {
    id: 'EMAIL_MARKETING',
    label: 'Email Marketing / Lifecycle',
    synonyms: [
      'email marketing', 'email automation', 'lifecycle marketing',
      'drip campaigns', 'email campaigns', 'newsletter marketing',
      'retention marketing', 'email strategy', 'klaviyo', 'mailchimp',
      'triggered emails', 'transactional email',
    ],
    acronyms: [],
    relatedGroups: [
      { id: 'CONTENT_MARKETING', similarity: 0.40 },
      { id: 'MARTECH',           similarity: 0.35 },
      { id: 'GROWTH_MARKETING',  similarity: 0.35 },
    ],
    parentGroup: 'GROWTH_MARKETING',
  },
  {
    id: 'CONTENT_MARKETING',
    label: 'Content Marketing / Copywriting',
    synonyms: [
      'content marketing', 'content strategy', 'copywriting', 'blog writing',
      'editorial strategy', 'content creation', 'content agency',
      'thought leadership', 'brand storytelling', 'inbound marketing',
    ],
    acronyms: [],
    relatedGroups: [
      { id: 'SEO',              similarity: 0.50 },
      { id: 'EMAIL_MARKETING',  similarity: 0.40 },
      { id: 'GROWTH_MARKETING', similarity: 0.30 },
    ],
    parentGroup: 'GROWTH_MARKETING',
  },
  {
    id: 'GROWTH_MARKETING',
    label: 'Growth Marketing / PLG',
    synonyms: [
      'growth marketing', 'growth hacking', 'demand generation', 'lead generation',
      'product led growth', 'plg', 'growth strategy', 'user acquisition',
      'b2b growth', 'saas growth', 'go-to-market', 'gtm strategy',
      'revenue growth', 'pipeline generation',
    ],
    acronyms: ['plg'],
    relatedGroups: [
      { id: 'EXPERIMENTATION',    similarity: 0.45 },
      { id: 'ANALYTICS',          similarity: 0.30 },
      { id: 'PPC_SEM',            similarity: 0.35 },
      { id: 'EMAIL_MARKETING',    similarity: 0.35 },
      { id: 'CONTENT_MARKETING',  similarity: 0.30 },
    ],
    childGroups: ['EMAIL_MARKETING', 'CONTENT_MARKETING', 'PPC_SEM'],
  },
  {
    id: 'ECOMMERCE_OPTIMIZATION',
    label: 'eCommerce Optimization',
    synonyms: [
      'ecommerce optimization', 'ecommerce cro', 'shopify optimization',
      'shopify development', 'shopify agency', 'woocommerce',
      'magento', 'ecommerce development', 'ecommerce strategy',
      'product page optimization', 'cart abandonment', 'checkout optimization',
      'shopify plus', 'ecommerce growth',
    ],
    acronyms: [],
    relatedGroups: [
      { id: 'CRO',             similarity: 0.55 },
      { id: 'EXPERIMENTATION', similarity: 0.40 },
      { id: 'PERSONALIZATION', similarity: 0.35 },
      { id: 'ANALYTICS',       similarity: 0.25 },
    ],
    parentGroup: 'CRO',
  },
  {
    id: 'SAAS_PRODUCT',
    label: 'SaaS / B2B Software',
    synonyms: [
      'saas', 'b2b software', 'software as a service', 'product development',
      'platform development', 'api platform', 'developer tools', 'cloud software',
      'enterprise software', 'b2b platform', 'software product',
    ],
    acronyms: [],
    relatedGroups: [
      { id: 'MARTECH',         similarity: 0.30 },
      { id: 'ANALYTICS',       similarity: 0.25 },
      { id: 'GROWTH_MARKETING', similarity: 0.25 },
    ],
  },
  {
    id: 'MARTECH',
    label: 'MarTech / Marketing Technology',
    synonyms: [
      'martech', 'marketing technology', 'marketing stack', 'cdp',
      'customer data platform', 'crm', 'customer relationship management',
      'marketing automation', 'tag management', 'gtm', 'data management platform',
      'dmp', 'identity resolution', 'marketing ops', 'revenue ops',
    ],
    acronyms: ['cdp', 'crm'],
    relatedGroups: [
      { id: 'ANALYTICS',       similarity: 0.35 },
      { id: 'PERSONALIZATION', similarity: 0.35 },
      { id: 'EMAIL_MARKETING', similarity: 0.35 },
      { id: 'SAAS_PRODUCT',    similarity: 0.30 },
    ],
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────────────

function buildGroupIndex(ontology: SemanticGroup[]): Map<string, SemanticGroup> {
  return new Map(ontology.map((g) => [g.id, g]));
}

/**
 * Maps free text (e.g. primaryCompetitiveIdentity, specialties, services)
 * to matching ontology group IDs.
 *
 * Short synonyms (≤3 chars, e.g. "bi", "ux") use word-boundary matching to
 * prevent substring false positives ("bi" in "plumbing", "ux" in "luxury").
 * Longer synonyms use substring matching (phrase-in-sentence).
 */
export function mapToSemanticGroups(
  text: string | string[],
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
): string[] {
  const corpus = (Array.isArray(text) ? text.join(' ') : text).toLowerCase();
  const matched: string[] = [];

  for (const group of ontology) {
    const hit = group.synonyms.some((s) => {
      if (s.length <= 3) {
        // Word-boundary match for short terms to avoid substring noise.
        return new RegExp(`(?:^|[^a-z0-9])${s}(?:[^a-z0-9]|$)`).test(corpus);
      }
      return corpus.includes(s);
    });
    if (hit) matched.push(group.id);
  }

  return [...new Set(matched)];
}

/**
 * Returns the similarity weight between two group IDs (0 if unrelated, 1 if same).
 * Does NOT use parentGroup/childGroups for scoring — relatedGroups values are the source
 * of truth. Hierarchy metadata is exposed via groupRelationship() for observability.
 */
export function groupSimilarity(
  groupIdA: string,
  groupIdB: string,
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
): number {
  if (groupIdA === groupIdB) return 1.0;

  const index = buildGroupIndex(ontology);
  const groupA = index.get(groupIdA);
  if (!groupA) return 0;

  const rel = groupA.relatedGroups.find((r) => r.id === groupIdB);
  return rel?.similarity ?? 0;
}

/**
 * Returns the structural relationship type between two groups.
 * Used for observability / reasoning strings — does NOT affect scoring.
 *   'same'         — identical groups
 *   'parent-child' — one is the sub-discipline of the other
 *   'sibling'      — both share the same parent
 *   'related'      — connected via relatedGroups (peer relationship)
 *   'unrelated'    — no connection
 */
export function groupRelationship(
  groupIdA: string,
  groupIdB: string,
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
): 'same' | 'parent-child' | 'sibling' | 'related' | 'unrelated' {
  if (groupIdA === groupIdB) return 'same';

  const index = buildGroupIndex(ontology);
  const groupA = index.get(groupIdA);
  const groupB = index.get(groupIdB);
  if (!groupA || !groupB) return 'unrelated';

  // Parent-child: A is parent of B, or B is parent of A
  if (groupA.childGroups?.includes(groupIdB)) return 'parent-child';
  if (groupB.childGroups?.includes(groupIdA)) return 'parent-child';
  if (groupA.parentGroup === groupIdB || groupB.parentGroup === groupIdA) return 'parent-child';

  // Sibling: both share the same parentGroup
  if (
    groupA.parentGroup &&
    groupB.parentGroup &&
    groupA.parentGroup === groupB.parentGroup
  ) return 'sibling';

  // Related: connected via relatedGroups
  const inA = groupA.relatedGroups.some((r) => r.id === groupIdB);
  const inB = groupB.relatedGroups.some((r) => r.id === groupIdA);
  if (inA || inB) return 'related';

  return 'unrelated';
}

/**
 * Returns acronyms from the given group IDs — used to build domain-slug filters
 * that adapt to the target company's actual specialty groups.
 *
 * @param groupIds  - ontology group IDs to include
 * @param ontology  - ontology to use
 * @param similarityThreshold - also include acronyms from groups closely related
 *                              to the target groups (0 = only exact groups)
 */
export function getGroupAcronyms(
  groupIds: string[],
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
  similarityThreshold = 0,
): string[] {
  const index = buildGroupIndex(ontology);
  const resultSet = new Set<string>();

  const targetSet = new Set(groupIds);

  for (const group of ontology) {
    const isTarget = targetSet.has(group.id);
    if (isTarget) {
      group.acronyms.forEach((a) => resultSet.add(a));
      continue;
    }
    if (similarityThreshold > 0) {
      const maxSim = Math.max(
        0,
        ...group.relatedGroups
          .filter((r) => targetSet.has(r.id))
          .map((r) => r.similarity),
      );
      if (maxSim >= similarityThreshold) {
        group.acronyms.forEach((a) => resultSet.add(a));
      }
    }
  }

  // Also include acronyms from related groups of the target groups (if threshold > 0)
  if (similarityThreshold > 0) {
    for (const id of groupIds) {
      const group = index.get(id);
      if (!group) continue;
      for (const rel of group.relatedGroups) {
        if (rel.similarity >= similarityThreshold) {
          index.get(rel.id)?.acronyms.forEach((a) => resultSet.add(a));
        }
      }
    }
  }

  return [...resultSet];
}

/**
 * Returns all synonym keywords for the given group IDs.
 * Useful for keyword-based text matching outside the ontology module.
 */
export function getGroupKeywords(
  groupIds: string[],
  ontology: SemanticGroup[] = DEFAULT_ONTOLOGY,
): string[] {
  const index = buildGroupIndex(ontology);
  const result = new Set<string>();

  for (const id of groupIds) {
    const group = index.get(id);
    if (group) {
      group.synonyms.forEach((s) => result.add(s));
    }
  }

  return [...result];
}
