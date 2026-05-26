// WHY a competitive-intent prompt instead of a service-listing prompt?
//
// The old approach asked: "what services does this company offer?"
// That produces a flat list (A/B Testing, CRO, Shopify Dev, WordPress Dev) where
// every service is weighted equally. Discovery providers then generate queries like
// "best Shopify development agencies" and surface dev agencies, not experimenters.
//
// The new approach asks: "what does this company PRIMARILY COMPETE ON?"
// This forces the LLM to distinguish between:
//   - Core competitive identity  (what buyers choose them for)
//   - Primary specialties        (the 2-4 things they most directly compete on)
//   - Secondary capabilities     (supporting services — offered but not their market identity)
//
// It also asks the LLM to generate competitorSearchQueries directly — queries a buyer
// would actually type to find this type of company. These queries are then handed to
// the listicle provider unchanged, so discovery is intent-driven from the start.

export function buildContextPrompt(domain: string, extractedContent: string): string {
  return `You are a senior competitive intelligence analyst. Your task is to determine a company's PRIMARY COMPETITIVE IDENTITY — what it actually competes on in the market — not just what services it lists on its website.

WEBSITE DOMAIN: ${domain}

EXTRACTED CONTENT:
${extractedContent}

---

ANALYSIS FRAMEWORK:

Many companies list many services, but only a subset defines their competitive identity.
Example: A company that does A/B Testing, CRO, Shopify Dev, WordPress Dev competes primarily
as an "Experimentation / A/B Testing Agency" — not as a generic dev agency or CRO tool.

You must determine:

1. PRIMARY COMPETITIVE IDENTITY — one concise phrase describing what this company IS in the market
   (e.g., "Experimentation / A/B Testing Agency", "B2B SaaS Analytics Platform", "eCommerce CRO Agency")
   CRITICAL: Do NOT anchor the identity to a platform (Shopify, Magento, WordPress, etc.) unless that
   platform IS the entire business model. A company that runs A/B tests for Shopify stores competes
   primarily as an "Experimentation Agency", NOT a "Shopify Agency" — Shopify is their client's platform,
   not the competitive identity. Identify WHAT the company does, not WHOSE platform they work on.

2. PRIMARY SPECIALTIES — 2-4 things they most directly compete on (what buyers choose them for)
   NOT every service on the site — only the core competitive differentiators

3. SECONDARY CAPABILITIES — services they offer as supporting work but don't primarily compete on
   (e.g., "Shopify Development" is secondary if the company's identity is "A/B Testing")

4. CORE SERVICES — what they actually deliver/sell (distinct from competitive identity)

5. COMPETITIVE SURFACES — specific market segments where they face direct competition
   (e.g., "Experimentation agencies for eCommerce", "CRO test development for Shopify stores")

6. COMPETITOR SEARCH QUERIES — generate 4-6 search queries a buyer would ACTUALLY TYPE to find
   companies like this one. These must be:
   - Specific to the PRIMARY COMPETITIVE IDENTITY (not generic industry terms)
   - Phrased as a buyer would search, not as a category label
   - Varied in angle (by specialty, by audience, by use case)
   - Useful for finding LISTICLE pages like "Top 10 X companies 2025"
   - Platform-specific queries (e.g. "Shopify CRO agency") should ONLY appear if the platform is
     explicitly stated as the PRIMARY differentiator in the extracted content. Prefer broader queries.

   GOOD examples for an A/B Testing agency:
     "top experimentation agencies", "best A/B testing agencies for ecommerce",
     "CRO testing consultancies", "conversion rate optimization agencies",
     "experimentation strategy firms"

   BAD examples (too generic or wrong focus):
     "best Marketing agencies", "top development companies", "web agency list",
     "Shopify CRO agency" (unless the content shows Shopify IS the primary identity)

7. CATEGORY — a short market category label (e.g., "Agency", "Platform", "Tool", "Consultancy")

Return ONLY valid JSON matching this exact structure. No extra text, no markdown fences.

{
  "companyType": "one of: Agency | SaaS | Marketplace | eCommerce Brand | Media | Consulting | Tool | Platform | Other",
  "category": "short market category (e.g. Agency, Platform, Tool, Consultancy)",
  "industry": "the primary industry (e.g. eCommerce, FinTech, Healthcare, Marketing, CRO)",
  "niche": "specific niche within the industry (e.g. Experimentation Agency for eCommerce, B2B SaaS analytics)",
  "primaryCompetitiveIdentity": "one concise phrase: what this company IS in the market",
  "primarySpecialties": ["2-4 things they most directly compete on — buyers choose them for these"],
  "secondaryCapabilities": ["supporting services offered but NOT their primary competitive identity"],
  "coreServices": ["what they actually deliver/sell, up to 8"],
  "services": ["complete flat list of all services mentioned, max 10 — for backward compatibility"],
  "competitiveSurfaces": ["specific market segments where they face direct competition, 2-5"],
  "competitorSearchQueries": ["4-6 search queries a buyer would type to find companies like this — specific to primary identity"],
  "targetAudience": ["target customer segments explicitly mentioned, max 5"],
  "positioningSummary": "1-2 sentence summary of competitive positioning (not just what they do, but HOW they position)",
  "extractedContentSummary": "1 sentence describing content quality/completeness",
  "confidence": "high if 4+ fields clearly supported by content, medium if 2-3, low if content is sparse"
}

Rules:
- primaryCompetitiveIdentity and primarySpecialties must reflect the MARKET IDENTITY, not a list of features.
- secondaryCapabilities are real services the company offers but that do NOT define who they compete with.
- competitorSearchQueries must be queries that would surface LISTICLE pages listing this type of company.
- competitorSearchQueries should focus on methodology and market segment, NOT on platforms (Shopify, WooCommerce)
  unless the platform is explicitly the primary differentiator in the extracted content.
- Never fabricate services, audiences, or industries not supported by the content.
- confidence reflects content evidence quality, not JSON completeness.
- If content is sparse, set confidence to "low" and populate what you can.`;
}
