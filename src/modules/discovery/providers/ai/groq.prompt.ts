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
// WHY semantic exclusion compression instead of raw domain list?
//   Raw list: "exclude domain1.com, domain2.com … domain120.com" = ~600 tokens,
//   zero semantic context, no exploration guidance, hard-excludes strong competitors.
//   Compressed: cluster summaries + 15 hard-exclusions + exploration guidance = ~150 tokens,
//   tells the LLM WHERE it has already looked and WHERE to explore next.
//
// WHY allow high-confidence rediscovery?
//   Repeated surfacing of strong competitors validates their relevance classification.
//   Only weak/unclassified domains are hard-excluded — they're the real noise.

import type { BusinessContext } from '../../types';
import type { CompressedExclusions } from './exclusion.compressor';

export function buildDiscoveryPrompt(
  domain: string,
  compressed: CompressedExclusions,
  businessContext?: BusinessContext,
): string {
  const contextBlock = businessContext
    ? buildContextBlock(businessContext)
    : `BUSINESS CONTEXT: Not available. Infer what the company does from the domain name alone.`;

  const exclusionBlock = buildExclusionBlock(compressed, businessContext);
  const explorationBlock = buildExplorationBlock(compressed, businessContext);

  return `You are a senior competitive intelligence analyst.

Your task is to identify REAL direct competitors of a company.

Target company domain: ${domain}

${contextBlock}

Using the context above, identify companies that:
- compete directly on the same PRIMARY COMPETITIVE IDENTITY
- share the same primary specialties
- target the same customer segments in the same market

${exclusionBlock}

${explorationBlock}

STRICT RULES:
- Return ONLY real, existing competitor domains
- Return ONLY root domains (no paths, no protocols)
- No descriptions or explanations
- Do NOT include ${domain} itself
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

// ── Exclusion block ───────────────────────────────────────────────────────────

function buildExclusionBlock(compressed: CompressedExclusions, ctx?: BusinessContext): string {
  const lines: string[] = [];

  if (compressed.totalExcluded === 0) {
    lines.push('DISCOVERY MEMORY: No prior competitors on record — full exploration mode.');
    return lines.join('\n');
  }

  lines.push(`DISCOVERY MEMORY — ${compressed.totalExcluded} competitors already in database:`);

  if (compressed.clusters.length > 0) {
    lines.push('');
    lines.push('Competitor segments already well-covered:');
    for (const cluster of compressed.clusters) {
      const exampleStr = cluster.examples.length > 0
        ? ` (e.g. ${cluster.examples.join(', ')})`
        : '';
      lines.push(`  - ${cluster.label}: ${cluster.count} known${exampleStr}`);
    }
    lines.push('');
    if (compressed.stats.rediscoverableCount > 0) {
      lines.push(
        `Note: ${compressed.stats.rediscoverableCount} high-confidence competitors from these segments ` +
        `remain discoverable — you MAY still return strong direct competitors even from covered segments ` +
        `if they are highly relevant. The goal is exploration diversity, not total exclusion.`,
      );
      lines.push('');
    }
  }

  if (compressed.hardExclusions.length > 0) {
    lines.push(`Do NOT return these specific domains under any circumstances:`);
    for (const d of compressed.hardExclusions) {
      lines.push(`  - ${d}`);
    }
    const unlistedCount = compressed.stats.totalExclusions
      - compressed.stats.clusteredDomains
      - compressed.hardExclusions.length;
    if (unlistedCount > 0) {
      lines.push(`  (+ ${unlistedCount} additional low-value domains suppressed)`);
    }
  } else if (compressed.clusters.length > 0) {
    lines.push('No explicit domain exclusions — focus on exploration and diversity.');
  }

  // Surface context to guide away from secondary identity anchor (Shopify, etc.)
  if (ctx?.secondaryCapabilities && ctx.secondaryCapabilities.length > 0) {
    lines.push('');
    lines.push(
      `IMPORTANT: Do NOT anchor discovery to secondary capabilities ` +
      `(${ctx.secondaryCapabilities.slice(0, 3).join(', ')}). ` +
      `These are supporting services, not the primary competitive identity.`,
    );
  }

  return lines.join('\n');
}

// ── Exploration guidance ──────────────────────────────────────────────────────

function buildExplorationBlock(compressed: CompressedExclusions, ctx?: BusinessContext): string {
  const focusAreas = buildExplorationFocus(compressed, ctx);

  if (focusAreas.length === 0) return '';

  const lines = [
    'EXPLORATION FOCUS — prioritize discovering competitors in these under-explored areas:',
    ...focusAreas.map((f) => `  - ${f}`),
  ];

  return lines.join('\n');
}

function buildExplorationFocus(
  compressed: CompressedExclusions,
  ctx?: BusinessContext,
): string[] {
  if (!ctx) return [];

  const identity = ctx.primaryCompetitiveIdentity;
  const hasIdentity = identity && identity !== 'Unknown';

  if (!hasIdentity) return [];

  const identityLower = identity.toLowerCase();
  const specialties = ctx.primarySpecialties ?? [];
  const focus: string[] = [];

  // Always suggest segments that vary by scale and region
  focus.push(`emerging boutique ${identityLower} firms not yet in database`);

  if (specialties[0]) {
    focus.push(`specialist ${specialties[0].toLowerCase()} agencies`);
  }
  if (specialties[1]) {
    focus.push(`${specialties[1].toLowerCase()} focused consultancies`);
  }

  // Add enterprise / regional variants if fewer than 10 total found so far
  if (compressed.totalExcluded < 10) {
    focus.push(`enterprise ${identityLower} platforms`);
    focus.push(`regional / niche market ${identityLower} agencies`);
  } else {
    focus.push(`enterprise-scale ${identityLower} firms`);
  }

  return focus.slice(0, 5);
}

// ── Context block ─────────────────────────────────────────────────────────────

function buildContextBlock(ctx: BusinessContext): string {
  const hasPrimaryIdentity =
    ctx.primaryCompetitiveIdentity && ctx.primaryCompetitiveIdentity !== 'Unknown';
  const hasPrimarySpecialties = ctx.primarySpecialties && ctx.primarySpecialties.length > 0;
  const hasCompetitiveSurfaces = ctx.competitiveSurfaces && ctx.competitiveSurfaces.length > 0;

  if (hasPrimaryIdentity || hasPrimarySpecialties) {
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
        `- Secondary capabilities (DO NOT use to find competitors — supporting services, not primary identity): ${ctx.secondaryCapabilities.join(', ')}`,
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

  // Fallback for contexts without competitive identity fields
  return `CONFIRMED BUSINESS CONTEXT (extracted directly from the website — trust this over any guesses):
- Company type: ${ctx.companyType}
- Industry: ${ctx.industry}
- Niche: ${ctx.niche}
- Services offered: ${ctx.services.length > 0 ? ctx.services.join(', ') : 'not specified'}
- Target audience: ${ctx.targetAudience && ctx.targetAudience.length > 0 ? ctx.targetAudience.join(', ') : 'not specified'}
- Positioning: ${ctx.positioningSummary || 'not specified'}
- Context confidence: ${ctx.confidence}`;
}
