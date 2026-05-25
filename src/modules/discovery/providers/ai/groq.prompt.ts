// WHY competitive-identity-first prompting?
//
// Old approach: passed all services equally → LLM found tangential competitors
// (dev agencies, generic CRO tools) because "Shopify Development" had equal weight
// to "A/B Testing" in the prompt.
//
// New approach: leads with primaryCompetitiveIdentity and primarySpecialties.
// These were extracted by the context analyzer specifically to reflect what the
// company COMPETES ON, not what it happens to offer. By anchoring the discovery
// prompt to these fields, the LLM stays focused on the correct competitor segment.
//
// secondaryCapabilities are explicitly excluded from the framing to prevent drift
// into adjacent markets.

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
    ? buildContextBlock(businessContext)
    : `BUSINESS CONTEXT: Not available. Infer what the company does from the domain name alone.`;

  return `You are a senior competitive intelligence analyst.

Your task is to identify REAL direct competitors of a company.

Target company domain: ${domain}

${contextBlock}

Using the context above, identify companies that:
- compete directly on the same PRIMARY COMPETITIVE IDENTITY
- share the same primary specialties
- target the same customer segments in the same market

${exclusionBlock}

STRICT RULES:
- Return ONLY real, existing competitor domains
- Return ONLY root domains (no paths, no protocols)
- No descriptions or explanations
- Do NOT include ${domain} itself
- Do NOT include excluded domains
- Focus on PRIMARY identity competitors — do NOT drift into secondary/supporting service spaces
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

function buildContextBlock(ctx: BusinessContext): string {
  const hasPrimaryIdentity =
    ctx.primaryCompetitiveIdentity && ctx.primaryCompetitiveIdentity !== 'Unknown';
  const hasPrimarySpecialties = ctx.primarySpecialties && ctx.primarySpecialties.length > 0;
  const hasCompetitiveSurfaces = ctx.competitiveSurfaces && ctx.competitiveSurfaces.length > 0;

  if (hasPrimaryIdentity || hasPrimarySpecialties) {
    // Rich competitive context path — use intent-driven fields
    const lines: string[] = [
      `CONFIRMED COMPETITIVE IDENTITY (extracted from the website — this defines who they compete with):`,
      `- Primary competitive identity: ${ctx.primaryCompetitiveIdentity}`,
    ];

    if (hasPrimarySpecialties) {
      lines.push(`- Primary specialties (what buyers choose them for): ${ctx.primarySpecialties.join(', ')}`);
    }
    if (hasCompetitiveSurfaces) {
      lines.push(`- Competitive surfaces (market segments): ${ctx.competitiveSurfaces.join(', ')}`);
    }
    if (ctx.secondaryCapabilities && ctx.secondaryCapabilities.length > 0) {
      lines.push(
        `- Secondary capabilities (DO NOT use these to find competitors — they are supporting services, not the primary identity): ${ctx.secondaryCapabilities.join(', ')}`,
      );
    }

    lines.push(`- Industry: ${ctx.industry}`);
    lines.push(`- Niche: ${ctx.niche}`);

    if (ctx.targetAudience && ctx.targetAudience.length > 0) {
      lines.push(`- Target audience: ${ctx.targetAudience.join(', ')}`);
    }
    lines.push(`- Positioning: ${ctx.positioningSummary || 'not specified'}`);
    lines.push(`- Context confidence: ${ctx.confidence}`);

    return lines.join('\n');
  }

  // Fallback path — old-style context without competitive identity fields
  return `CONFIRMED BUSINESS CONTEXT (extracted directly from the website — trust this over any guesses):
- Company type: ${ctx.companyType}
- Industry: ${ctx.industry}
- Niche: ${ctx.niche}
- Services offered: ${ctx.services.length > 0 ? ctx.services.join(', ') : 'not specified'}
- Target audience: ${ctx.targetAudience && ctx.targetAudience.length > 0 ? ctx.targetAudience.join(', ') : 'not specified'}
- Positioning: ${ctx.positioningSummary || 'not specified'}
- Context confidence: ${ctx.confidence}`;
}
