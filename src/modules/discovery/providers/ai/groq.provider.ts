import type Groq from 'groq-sdk';
import type { Logger } from '../../../../lib/logger';
import { assertServerContext } from '../../../../lib/environment';
import type { DiscoveryInput, IDiscoveryProvider, ProviderResult } from '../../types';
import { AICompetitorResponseSchema } from '../../validators/discovery.validator';
import { normalizeDomain, validateDomain } from '../../../../shared/domain';
import { withRetry } from '../../utils/retry';
import { buildDiscoveryPrompt } from './groq.prompt';
import { ExclusionCompressor, type CompressedExclusions } from './exclusion.compressor';

interface GroqProviderOptions {
  model?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class GroqAIProvider implements IDiscoveryProvider {
  readonly name = 'groq';
  readonly discoveryMethod = 'ai-discovery';

  private readonly model: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly compressor: ExclusionCompressor;

  constructor(
    private readonly groq: Groq,
    private readonly logger: Logger,
    options: GroqProviderOptions = {},
  ) {
    assertServerContext('GroqAIProvider');
    this.model = options.model ?? 'llama-3.3-70b-versatile';
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.compressor = new ExclusionCompressor(logger);
  }

  async discover(input: DiscoveryInput): Promise<ProviderResult[]> {
    const logCtx = { queryId: input.queryId, domain: input.normalizedDomain, model: this.model };

    const ctx = input.businessContext;
    const usingIntentFields =
      ctx &&
      ctx.primaryCompetitiveIdentity !== undefined &&
      ctx.primaryCompetitiveIdentity !== 'Unknown';

    // ── Exclusion compression ─────────────────────────────────────────────────
    // Replace raw domain dumping with semantic cluster summaries + limited hard exclusions.
    // High-confidence competitors remain discoverable for reinforcement rediscovery.
    const compressed = this.compressor.compress(
      input.exclusions,
      input.knownCompetitorProfiles ?? [],
      input.normalizedDomain,
    );

    this.logger.info(
      {
        ...logCtx,
        totalExclusions:         input.exclusions.length,
        profilesAvailable:       (input.knownCompetitorProfiles ?? []).length,
        clusteredDomains:        compressed.stats.clusteredDomains,
        hardExcluded:            compressed.stats.hardExcluded,
        rediscoverable:          compressed.stats.rediscoverableCount,
        estimatedTokenReduction: compressed.stats.estimatedTokenReduction,
        primaryCompetitiveIdentity: ctx?.primaryCompetitiveIdentity ?? 'none',
        primarySpecialties:      ctx?.primarySpecialties ?? [],
        promptMode: usingIntentFields ? 'competitive-identity' : 'legacy-services',
      },
      'Groq AI discovery started',
    );

    const prompt = buildDiscoveryPrompt(input.normalizedDomain, compressed, input.businessContext);
    let rawContent: string;

    try {
      rawContent = await withRetry(() => this.callGroq(prompt), {
        maxAttempts: this.maxRetries,
        baseDelayMs: this.retryDelayMs,
        logger: this.logger,
        context: 'groq-ai-discovery',
        shouldRetry: isRetriableGroqError,
      });
    } catch (error) {
      this.logger.error({ ...logCtx, error }, 'Groq AI discovery failed after all retries — returning empty');
      return [];
    }

    const domains = this.parseAndValidate(rawContent, input, compressed);
    this.logger.info({ ...logCtx, discoveredCount: domains.length }, 'Groq AI discovery completed');

    return domains.map((domain) => ({
      domain,
      source: this.name,
      discoveryMethod: this.discoveryMethod,
    }));
  }

  private async callGroq(prompt: string): Promise<string> {
    const completion = await this.groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: this.model,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1024,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Groq returned empty content');
    }
    return content;
  }

  private parseAndValidate(
    rawContent: string,
    input: DiscoveryInput,
    compressed: CompressedExclusions,
  ): string[] {
    const logCtx = { queryId: input.queryId };
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      this.logger.warn({ ...logCtx, rawContent }, 'Groq returned malformed JSON');
      return [];
    }

    const result = AICompetitorResponseSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn({ ...logCtx, issues: result.error.issues }, 'Groq response failed schema validation');
      return [];
    }

    const inputNorm = normalizeDomain(input.normalizedDomain);
    const inputDomain = inputNorm.ok ? inputNorm.domain : input.normalizedDomain;

    // Only hard-exclude low-confidence / unclassified domains.
    // High/medium confidence domains (described semantically in the prompt) can be
    // rediscovered — this is intentional. Repeated discovery reinforces relevance.
    const hardExclusionSet = new Set<string>();
    for (const excl of compressed.hardExclusions) {
      const outcome = normalizeDomain(excl);
      if (outcome.ok) hardExclusionSet.add(outcome.domain);
    }

    const valid: string[] = [];
    const rediscovered: string[] = [];

    for (const raw of result.data.competitors) {
      const normOutcome = normalizeDomain(raw);
      if (!normOutcome.ok) continue;

      const valOutcome = validateDomain(normOutcome.domain);
      if (!valOutcome.ok) continue;

      const domain = normOutcome.domain;
      if (domain === inputDomain) continue;
      if (hardExclusionSet.has(domain)) continue;

      // Track rediscovered known competitors for logging
      if (input.exclusions.includes(domain) && !hardExclusionSet.has(domain)) {
        rediscovered.push(domain);
      }

      valid.push(domain);
    }

    if (rediscovered.length > 0) {
      this.logger.info(
        { queryId: input.queryId, rediscovered, count: rediscovered.length },
        'Groq AI discovery: high-confidence competitors rediscovered — reinforcing relevance',
      );
    }

    return valid;
  }
}

function isRetriableGroqError(error: Error): boolean {
  const msg = error.message;
  if (!msg.includes('429')) return true;
  return !msg.includes('tokens per day') && !msg.includes('TPD');
}
