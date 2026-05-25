// WHY batch profiling instead of per-competitor crawling?
//
// Crawling every qualified competitor (25–30 per run) would require:
//   • 25–30 HTTP requests + Playwright sessions (minutes of latency)
//   • 25–30 Groq calls for content analysis
//
// Instead, we use a SINGLE Groq call that leverages the LLM's world knowledge.
// The LLM acts as an encyclopedia: "What do you know about these companies?"
// For well-known domains (speero.com, widerfunnel.com), it returns accurate profiles.
// For unknown domains, it estimates from domain name + target industry context.
//
// This trades recall depth for speed — acceptable at this pipeline stage because:
//   1. The scoring comparison is relative (we care about similarity, not absolute facts)
//   2. Unknown companies in the same niche will naturally score lower
//   3. High-confidence profiles from the LLM are flagged as such

import type { ProfilingTargetContext } from '../types';

export function buildProfilingPrompt(domains: string[], targetContext: ProfilingTargetContext): string {
  const targetSummary = [
    `Domain: ${targetContext.domain}`,
    `Company Type: ${targetContext.companyType}`,
    `Industry: ${targetContext.industry}`,
    `Niche: ${targetContext.niche}`,
    `Primary Competitive Identity: ${targetContext.primaryCompetitiveIdentity}`,
    `Primary Specialties: ${targetContext.primarySpecialties.join(', ')}`,
    `Core Services: ${targetContext.coreServices.slice(0, 5).join(', ')}`,
    `Target Audience: ${targetContext.targetAudience.join(', ')}`,
  ].join('\n');

  const domainList = domains.map((d, i) => `${i + 1}. ${d}`).join('\n');

  return `You are a competitive intelligence analyst with deep knowledge of B2B companies, agencies, and SaaS tools.

TARGET COMPANY (for context on what industry/niche we are researching):
${targetSummary}

COMPETITOR DOMAINS TO PROFILE:
${domainList}

For each competitor domain, provide a structured profile based on your knowledge. Use the target company's industry as context when estimating profiles for companies you don't know well.

IMPORTANT RULES:
- Set confidence to "high" only if you know this company well
- Set confidence to "medium" if you partially know it
- Set confidence to "low" if you are estimating from domain name + industry context
- Keep all arrays concise: max 4 items each
- Never invent specific claims about unknown companies — use generic descriptors in that case
- primaryCompetitiveIdentity must be a concise phrase, not a sentence

CANONICAL VOCABULARY — use these exact terms in primarySpecialties and coreServices for consistency:
- "A/B Testing" (not "split testing", "AB testing", "experimentation" alone, "experiment running")
- "CRO" (not "Conversion Rate Optimization", "conversion optimization", "conversion rate improvement")
- "Personalization" (not "personalisation")
- "eCommerce" (not "e-commerce", "ecom")
- "SEO" (not "search engine optimization")
- "PPC" (not "pay per click", "paid search")
- "Analytics" (not "data analytics", "web analytics" unless meaningfully different)

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "profiles": [
    {
      "domain": "example.com",
      "companyType": "Agency|SaaS|Platform|Tool|Marketplace|Media|eCommerce|Consulting|Other",
      "industry": "primary industry (e.g. Marketing, eCommerce, FinTech, Healthcare)",
      "niche": "specific niche within industry",
      "primaryCompetitiveIdentity": "concise phrase: what this company IS in the market",
      "primarySpecialties": ["2-4 core things they compete on"],
      "coreServices": ["3-5 main services or products"],
      "targetAudience": ["1-3 target customer segments"],
      "positioning": "1 sentence positioning summary",
      "confidence": "high|medium|low"
    }
  ]
}`;
}
