import type Groq from 'groq-sdk';
import type { Logger } from '../../../lib/logger';
import { assertServerContext } from '../../../lib/environment';
import { withRetry } from '../../../lib/retry';
import type { ExtractedContent } from '../types';
import { ContextAnalysisError } from '../types';
import { AIBusinessContextSchema, type ValidatedAIBusinessContext } from '../validators/context.validator';
import { buildContextPrompt } from './context.prompt';
import { buildContentForAI } from '../utils/content.utils';

interface GroqAnalyzerOptions {
  model?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class GroqAnalyzer {
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly groq: Groq,
    private readonly logger: Logger,
    options: GroqAnalyzerOptions = {},
  ) {
    assertServerContext('GroqAnalyzer');
    this.model = options.model ?? process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile';
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  async analyze(
    domain: string,
    extracted: ExtractedContent,
    queryId: string,
  ): Promise<ValidatedAIBusinessContext> {
    const logCtx = { queryId, domain, model: this.model };
    this.logger.info(logCtx, 'GroqAnalyzer: analysis started');

    const contentForAI = buildContentForAI(
      extracted.title,
      extracted.metaDescription,
      extracted.headings,
      extracted.heroText,
      extracted.servicesText,
      extracted.aboutText,
      extracted.navLabels,
      extracted.bodyText,
    );

    const prompt = buildContextPrompt(domain, contentForAI);
    let rawContent: string;

    try {
      rawContent = await withRetry(() => this.callGroq(prompt), {
        maxAttempts: this.maxRetries,
        baseDelayMs: this.retryDelayMs,
        logger: this.logger,
        context: 'groq-context-analysis',
        shouldRetry: isRetriableGroqError,
      });
    } catch (error) {
      throw new ContextAnalysisError(
        'Groq analysis failed after all retries',
        error instanceof Error ? error : undefined,
      );
    }

    return this.parseAndValidate(rawContent, logCtx);
  }

  private async callGroq(prompt: string): Promise<string> {
    const completion = await this.groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: this.model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      // Increased from 1024: competitive intent schema is richer (competitorSearchQueries,
      // primarySpecialties, competitiveSurfaces all add tokens to the response).
      max_tokens: 2048,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Groq returned empty content');
    return content;
  }

  private parseAndValidate(
    rawContent: string,
    logCtx: Record<string, unknown>,
  ): ValidatedAIBusinessContext {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      this.logger.warn({ ...logCtx, rawContent }, 'GroqAnalyzer: malformed JSON — using low-confidence fallback');
      return this.lowConfidenceFallback();
    }

    const result = AIBusinessContextSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(
        { ...logCtx, issues: result.error.issues },
        'GroqAnalyzer: schema validation failed — using low-confidence fallback',
      );
      return this.lowConfidenceFallback();
    }

    this.logger.info(
      {
        ...logCtx,
        confidence: result.data.confidence,
        industry: result.data.industry,
        primaryCompetitiveIdentity: result.data.primaryCompetitiveIdentity,
        primarySpecialties: result.data.primarySpecialties,
        competitorSearchQueries: result.data.competitorSearchQueries,
        queriesGeneratedFrom: 'primaryCompetitiveIdentity + primarySpecialties + competitiveSurfaces',
      },
      'GroqAnalyzer: analysis complete',
    );
    return result.data;
  }

  private lowConfidenceFallback(): ValidatedAIBusinessContext {
    return {
      companyType: 'Unknown',
      category: 'Unknown',
      industry: 'Unknown',
      niche: 'Unknown',
      primaryCompetitiveIdentity: 'Unknown',
      primarySpecialties: [],
      secondaryCapabilities: [],
      coreServices: [],
      competitiveSurfaces: [],
      competitorSearchQueries: [],
      services: [],
      targetAudience: [],
      positioningSummary: '',
      extractedContentSummary: 'Content extraction or analysis failed',
      confidence: 'low',
    };
  }
}

// Daily quota (TPD) errors won't recover on retry — bail immediately.
// Per-minute (TPM) errors may recover after a short delay — allow retries.
function isRetriableGroqError(error: Error): boolean {
  const msg = error.message;
  if (!msg.includes('429')) return true;
  return !msg.includes('tokens per day') && !msg.includes('TPD');
}
