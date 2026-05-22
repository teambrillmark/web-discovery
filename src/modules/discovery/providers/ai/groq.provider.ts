import type Groq from 'groq-sdk';
import type { Logger } from '../../../../lib/logger';
import { assertServerContext } from '../../../../lib/environment';
import type { DiscoveryInput, IDiscoveryProvider, ProviderResult } from '../../types';
import { AICompetitorResponseSchema } from '../../validators/discovery.validator';
import { normalizeDomain, validateDomain } from '../../../../shared/domain';
import { withRetry } from '../../utils/retry';
import { buildDiscoveryPrompt } from './groq.prompt';

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

  constructor(
    private readonly groq: Groq,
    private readonly logger: Logger,
    options: GroqProviderOptions = {},
  ) {
    assertServerContext('GroqAIProvider');
    this.model = options.model ?? 'llama-3.3-70b-versatile';
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  async discover(input: DiscoveryInput): Promise<ProviderResult[]> {
    const logCtx = { queryId: input.queryId, domain: input.normalizedDomain, model: this.model };

    this.logger.info(
      { ...logCtx, excludedCount: input.exclusions.length },
      'Groq AI discovery started',
    );

    const prompt = buildDiscoveryPrompt(input.normalizedDomain, input.exclusions, input.businessContext);
    let rawContent: string;

    try {
      rawContent = await withRetry(() => this.callGroq(prompt), {
        maxAttempts: this.maxRetries,
        baseDelayMs: this.retryDelayMs,
        logger: this.logger,
        context: 'groq-ai-discovery',
      });
    } catch (error) {
      this.logger.error({ ...logCtx, error }, 'Groq AI discovery failed after all retries — returning empty');
      return [];
    }

    const domains = this.parseAndValidate(rawContent, input);
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

  private parseAndValidate(rawContent: string, input: DiscoveryInput): string[] {
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

    // Normalize the input domain using the canonical function for consistent comparison.
    const inputNorm = normalizeDomain(input.normalizedDomain);
    const inputDomain = inputNorm.ok ? inputNorm.domain : input.normalizedDomain;

    // Build exclusion set with canonical normalization — matches what is stored in DB.
    const exclusionSet = new Set<string>();
    for (const excl of input.exclusions) {
      const outcome = normalizeDomain(excl);
      if (outcome.ok) exclusionSet.add(outcome.domain);
    }

    const valid: string[] = [];
    for (const raw of result.data.competitors) {
      const normOutcome = normalizeDomain(raw);
      if (!normOutcome.ok) continue;

      const valOutcome = validateDomain(normOutcome.domain);
      if (!valOutcome.ok) continue;

      const domain = normOutcome.domain;
      if (domain === inputDomain) continue;
      if (exclusionSet.has(domain)) continue;

      valid.push(domain);
    }

    return valid;
  }
}
