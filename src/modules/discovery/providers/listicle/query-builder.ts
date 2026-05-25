// WHY two-tier query generation?
//
// Tier 1 — AI-generated queries (preferred):
//   The context extractor's LLM already analyzed the company and generated
//   competitorSearchQueries specifically for this company's primary competitive identity.
//   Example for Brillmark: ["top experimentation agencies", "best A/B testing agencies for ecommerce", ...]
//   These are contextual, intent-driven, and specific to the company — use them directly.
//
// Tier 2 — Template fallback (only when tier 1 is unavailable):
//   If competitorSearchQueries is empty (low-confidence extraction, context unavailable,
//   or pre-enrichment caller), fall back to the template system derived from industry/niche/services.
//   This preserves the old behavior as a safety net without regressing callers that don't
//   yet pass enriched context.
//
// Data flow: BusinessContext → competitorSearchQueries (if present) → page-extractor
//                           OR → template system → page-extractor

import type { BusinessContext } from '../../types';

const CURRENT_YEAR = new Date().getFullYear().toString();
const MAX_QUERIES = 6;

// Template fallback — only fires when AI-generated queries are absent.
// Kept intentionally simple: the AI path is the primary investment.
type QueryTemplate = (ctx: BusinessContext) => string | null;

const FALLBACK_TEMPLATES: QueryTemplate[] = [
  (ctx) => (ctx.primaryCompetitiveIdentity && ctx.primaryCompetitiveIdentity !== 'Unknown'
    ? `top ${ctx.primaryCompetitiveIdentity.toLowerCase()} companies`
    : null),
  (ctx) => (ctx.primarySpecialties[0]
    ? `best ${ctx.primarySpecialties[0]} agencies`
    : null),
  (ctx) => (ctx.niche && ctx.niche.toLowerCase() !== ctx.industry.toLowerCase()
    ? `top ${ctx.niche} companies`
    : null),
  (ctx) => (ctx.industry
    ? `best ${ctx.industry} agencies`
    : null),
  (ctx) => (ctx.primarySpecialties[0]
    ? `best ${ctx.primarySpecialties[0]} agencies ${CURRENT_YEAR}`
    : null),
  (ctx) => (ctx.industry
    ? `${ctx.industry} agency list ${CURRENT_YEAR}`
    : null),
];

export function buildListicleQueries(ctx: BusinessContext): string[] {
  // Tier 1: use AI-generated queries if available — they are already contextual and specific
  if (ctx.competitorSearchQueries && ctx.competitorSearchQueries.length > 0) {
    const queries = ctx.competitorSearchQueries.slice(0, MAX_QUERIES);
    return queries;
  }

  // Tier 2: template fallback — derives queries from structured context fields
  const queries: string[] = [];
  const seen = new Set<string>();

  for (const template of FALLBACK_TEMPLATES) {
    if (queries.length >= MAX_QUERIES) break;

    const q = template(ctx);
    if (!q) continue;

    const key = q.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;

    seen.add(key);
    queries.push(q.trim());
  }

  return queries;
}
