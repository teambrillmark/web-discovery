// Translates BusinessContext into listicle-style search queries.
//
// WHY listicle queries specifically?
// Searches like "best CRO agencies" surface article pages ("Top 10 CRO Companies 2024")
// that already contain curated competitor lists with working website links.
// These pages do the competitor research for us — we just extract the domains.
//
// Data flow: BusinessContext -> string[] queries -> page-extractor -> domain-extractor

import type { BusinessContext } from '../../types';

const CURRENT_YEAR = new Date().getFullYear().toString();
const MAX_QUERIES = 4;

// Each template returns a query string from the context, or null if the
// required field is missing/empty. Null slots are skipped at build time.
type QueryTemplate = (ctx: BusinessContext) => string | null;

const TEMPLATES: QueryTemplate[] = [
  // Primary: industry-level query (most specific, highest signal)
  (ctx) => (ctx.industry ? `best ${ctx.industry} agencies` : null),

  // Secondary: niche-level query — only emit if it adds new information
  (ctx) => (ctx.niche && ctx.niche.toLowerCase() !== ctx.industry.toLowerCase() ? `top ${ctx.niche} companies` : null),

  // Tertiary: service-specific with year for recency
  (ctx) => (ctx.services.length > 0 ? `best ${ctx.services[0]} agencies ${CURRENT_YEAR}` : null),

  // Quaternary: industry list with year to target recent roundup posts
  (ctx) => (ctx.industry ? `${ctx.industry} agency list ${CURRENT_YEAR}` : null),
];

export function buildListicleQueries(ctx: BusinessContext): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  for (const template of TEMPLATES) {
    if (queries.length >= MAX_QUERIES) break;

    const q = template(ctx);
    if (!q) continue;

    // Deduplicate by normalized form to avoid near-identical queries
    const key = q.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;

    seen.add(key);
    queries.push(q.trim());
  }

  return queries;
}
