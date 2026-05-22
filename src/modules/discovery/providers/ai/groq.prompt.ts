import type { BusinessContext } from '../../types';

const MAX_EXCLUSIONS_IN_PROMPT = 50;

export function buildDiscoveryPrompt(
  domain: string,
  exclusions: string[],
  businessContext?: BusinessContext,
): string {
  const truncated = exclusions.slice(0, MAX_EXCLUSIONS_IN_PROMPT);

  const exclusionBlock =
    truncated.length > 0
      ? `Known competitors to EXCLUDE — do NOT include these in your response:\n${truncated.map((e) => `- ${e}`).join('\n')}`
      : 'No exclusions.';

  const contextBlock = businessContext
    ? `CONFIRMED BUSINESS CONTEXT (extracted directly from the website — trust this over any guesses):
- Company type: ${businessContext.companyType}
- Industry: ${businessContext.industry}
- Niche: ${businessContext.niche}
- Services offered: ${businessContext.services.length > 0 ? businessContext.services.join(', ') : 'not specified'}
- Target audience: ${businessContext.targetAudience.length > 0 ? businessContext.targetAudience.join(', ') : 'not specified'}
- Positioning: ${businessContext.positioningSummary || 'not specified'}
- Context confidence: ${businessContext.confidence}`
    : `BUSINESS CONTEXT: Not available. Infer what the company does from the domain name alone.`;

  return `You are a senior competitive intelligence analyst.

Your task is to identify REAL direct competitors of a company.

Target company domain: ${domain}

${contextBlock}

Using the context above, identify companies that:
- offer the same or highly similar services/products
- target the same customer segments
- operate in the same industry niche
- compete directly in the same market

${exclusionBlock}

STRICT RULES:
- Return ONLY real, existing competitor domains
- Return ONLY root domains (no paths, no protocols)
- No descriptions or explanations
- Do NOT include ${domain} itself
- Do NOT include excluded domains
- Stay within the confirmed industry and niche — do NOT drift into unrelated sectors
- Prefer direct competitors over tangential ones

Return between 5 and 20 competitors if possible.

Respond ONLY with valid JSON in this exact format:

{
  "competitors": [
    "example1.com",
    "example2.com"
  ]
}
`;
}