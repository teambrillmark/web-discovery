// Groq-based batch competitor profiler.
//
// One API call profiles up to BATCH_SIZE domains at once. The LLM acts as an
// encyclopedia — it's asked "what do you know about these companies?" rather than
// "score these companies". Scoring is deterministic and happens AFTER profiling.
//
// Fallback behavior:
//   • API error → return empty profiles (no crash, scoring uses nulls)
//   • Parse failure → return empty profiles
//   • Missing domain in response → return empty profile for that domain
//
// WHY not retry on failure?
// Profiling is additive intelligence. A failed profiling run degrades ranking quality
// (scores will be low) but doesn't break discovery or qualification. Adding retry
// logic here would delay the response for a non-critical enrichment step.

import type Groq from 'groq-sdk';
import type { Logger } from '../../../lib/logger';
import type { CompetitorProfile, ProfilingTargetContext } from '../types';
import { buildProfilingPrompt } from './profile.prompt';
import { AIProfileResponseSchema } from './profile.validator';

const BATCH_SIZE = 20;

export class GroqProfiler {
  constructor(
    private readonly groq: Groq,
    private readonly logger: Logger,
    private readonly model = process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile',
  ) {}

  async profileBatch(
    domains: string[],
    targetContext: ProfilingTargetContext,
    queryId: string,
  ): Promise<CompetitorProfile[]> {
    if (domains.length === 0) return [];

    // Process in batches to stay within token limits
    const batches: string[][] = [];
    for (let i = 0; i < domains.length; i += BATCH_SIZE) {
      batches.push(domains.slice(i, i + BATCH_SIZE));
    }

    // Process batches in parallel — safe because each batch is an independent API call.
    // For the common case of ≤20 domains there's only one batch; for larger runs
    // this avoids sequential latency cost (e.g. 40 domains = 2 calls × 5s = 5s not 10s).
    const batchResults = await Promise.all(
      batches.map((batch) => this.profileBatchChunk(batch, targetContext, queryId)),
    );
    return batchResults.flat();
  }

  private async profileBatchChunk(
    domains: string[],
    targetContext: ProfilingTargetContext,
    queryId: string,
  ): Promise<CompetitorProfile[]> {
    const logCtx = { queryId, domainCount: domains.length, model: this.model };
    this.logger.info(logCtx, 'GroqProfiler: profiling batch');

    const prompt = buildProfilingPrompt(domains, targetContext);

    let rawContent: string;
    try {
      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      });
      rawContent = response.choices[0]?.message?.content ?? '';
    } catch (err) {
      this.logger.error({ queryId, error: err }, 'GroqProfiler: API call failed — returning empty profiles');
      return domains.map(buildEmptyProfile);
    }

    const parsed = AIProfileResponseSchema.safeParse(safeParseJson(rawContent));
    if (!parsed.success) {
      this.logger.warn(
        { queryId, issues: parsed.error.issues, rawContent: rawContent.slice(0, 200) },
        'GroqProfiler: schema validation failed — returning empty profiles',
      );
      return domains.map(buildEmptyProfile);
    }

    const byDomain = new Map(parsed.data.profiles.map((p) => [p.domain, p]));

    this.logger.info(
      { queryId, returned: parsed.data.profiles.length, requested: domains.length },
      'GroqProfiler: batch complete',
    );

    return domains.map((domain) => {
      const ai = byDomain.get(domain);
      if (!ai) {
        this.logger.debug({ queryId, domain }, 'GroqProfiler: domain missing from response — using empty profile');
        return buildEmptyProfile(domain);
      }
      return {
        domain,
        companyType:                ai.companyType,
        industry:                   ai.industry,
        niche:                      ai.niche,
        primaryCompetitiveIdentity: ai.primaryCompetitiveIdentity,
        primarySpecialties:         ai.primarySpecialties,
        coreServices:               ai.coreServices,
        targetAudience:             ai.targetAudience,
        positioning:                ai.positioning,
        aiConfidence:               ai.confidence,
      };
    });
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract JSON object from raw string
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return {};
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return {};
    }
  }
}

function buildEmptyProfile(domain: string): CompetitorProfile {
  return {
    domain,
    companyType:                null,
    industry:                   null,
    niche:                      null,
    primaryCompetitiveIdentity: null,
    primarySpecialties:         [],
    coreServices:               [],
    targetAudience:             [],
    positioning:                null,
    aiConfidence:               'low',
  };
}
