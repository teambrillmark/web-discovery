// Qualification AI prompt builder.
//
// DESIGN PHILOSOPHY — asymmetric confidence threshold:
//   Unknown domains get benefit of the doubt (assumed relevant).
//   Well-known non-competitors get rejected with high confidence.
//
// WHY this asymmetry?
//   A false negative (rejecting a real competitor) is more costly than a
//   false positive (accepting a non-competitor). The deduplication engine
//   will accumulate rejected domains over time; the intelligence memory
//   never gets a chance to reconsider a permanently-rejected real competitor.
//
//   So: only reject when CONFIDENT it's wrong. Default to accepting.
//
// The prompt is compact (fits in one short API call) so we can batch
// all remaining candidates after rule filtering in a single Groq request.

import type { QualificationContext } from '../types';

const MAX_CANDIDATES_PER_BATCH = 25;

export function buildQualificationPrompt(
  domains: string[],
  context: QualificationContext,
): string {
  const candidates = domains.slice(0, MAX_CANDIDATES_PER_BATCH);

  const contextBlock = context.primaryCompetitiveIdentity && context.primaryCompetitiveIdentity !== 'Unknown'
    ? `Company type: ${context.primaryCompetitiveIdentity}
Primary specialties: ${context.primarySpecialties.slice(0, 4).join(', ')}
Industry: ${context.industry}
Niche: ${context.niche}`
    : `Industry: ${context.industry}
Niche: ${context.niche}`;

  return `You are a B2B competitive intelligence analyst validating competitor candidates.

TARGET COMPANY PROFILE:
${contextBlock}

TASK: For each domain below, determine if it is a relevant competitor or not.

CRITICAL RULE — UNKNOWN DOMAINS:
If you do NOT recognize a domain, assume it is probably a relevant competitor.
Mark unknown domains as: entityType="agency" or "saas", relevance="direct", confidence=0.55.
Only mark as irrelevant if you are CERTAIN it is not in this competitive space.

DOMAINS TO EVALUATE:
${candidates.map((d, i) => `${i + 1}. ${d}`).join('\n')}

For each domain output exactly:
{
  "domain": "<domain>",
  "entityType": "<agency|saas|tool|marketplace|directory|infrastructure|community|media|ecommerce|job-board|app-store|unknown>",
  "relevance": "<direct|adjacent|irrelevant>",
  "confidence": <0.0 to 1.0>
}

relevance guide:
- direct: same competitive space, would appear in "alternatives to X" lists
- adjacent: related industry but different focus (won't replace each other)
- irrelevant: different industry entirely, no overlap

Respond ONLY with valid JSON:
{
  "results": [ ...array of objects above... ]
}`;
}
