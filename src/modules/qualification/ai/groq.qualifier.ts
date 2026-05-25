// Groq-based AI qualifier.
//
// Receives a batch of rule-filtered candidates and asks Groq to assess
// entity type + relevance for each. One API call per qualification run
// (batching up to 25 domains) — efficient and avoids per-domain latency.
//
// Rejection threshold:
//   irrelevant + confidence >= 0.70 → reject
//   irrelevant + confidence <  0.70 → accept (uncertain = benefit of doubt)
//   direct | adjacent → accept unconditionally

import type Groq from 'groq-sdk';
import type { Logger } from '../../../lib/logger';
import type { QualificationContext, QualificationResult } from '../types';
import { buildQualificationPrompt } from './qualification.prompt';
import { AIQualificationResponseSchema } from './qualification.validator';
import { classifyEntityType } from '../classifiers/entity-classifier';

// Minimum confidence required to reject a domain on irrelevance grounds.
// Below this threshold we're uncertain — default to accepting.
const IRRELEVANCE_REJECTION_THRESHOLD = 0.70;

export class GroqQualifier {
  constructor(
    private readonly groq: Groq,
    private readonly logger: Logger,
    private readonly model = 'llama-3.3-70b-versatile',
  ) {}

  async qualify(
    domains: string[],
    context: QualificationContext,
    queryId: string,
  ): Promise<QualificationResult[]> {
    if (domains.length === 0) return [];

    const logCtx = { queryId, domainCount: domains.length };
    this.logger.info(logCtx, 'GroqQualifier: sending batch to AI');

    const prompt = buildQualificationPrompt(domains, context);

    let rawContent: string;
    try {
      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1024,
      });
      rawContent = response.choices[0]?.message?.content ?? '';
    } catch (err) {
      this.logger.error({ queryId, error: err }, 'GroqQualifier: API call failed — accepting all candidates');
      // Safe fallback: if AI fails, accept everything (don't silently drop candidates)
      return domains.map((domain) => ({
        domain,
        accepted: true,
        classification: classifyEntityType(domain),
        relevance: 'direct',
        confidence: 0.5,
      }));
    }

    // ── Parse and validate AI response ────────────────────────────────────────
    let parsed: ReturnType<typeof AIQualificationResponseSchema.safeParse>;
    try {
      const jsonStart = rawContent.indexOf('{');
      const jsonEnd   = rawContent.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found');
      const jsonStr = rawContent.slice(jsonStart, jsonEnd + 1);
      parsed = AIQualificationResponseSchema.safeParse(JSON.parse(jsonStr));
    } catch {
      this.logger.warn({ queryId, rawContent: rawContent.slice(0, 200) }, 'GroqQualifier: parse failed — accepting all');
      return domains.map((domain) => ({
        domain,
        accepted: true,
        classification: classifyEntityType(domain),
        relevance: 'direct',
        confidence: 0.5,
      }));
    }

    if (!parsed.success) {
      this.logger.warn({ queryId, issues: parsed.error.issues }, 'GroqQualifier: schema validation failed — accepting all');
      return domains.map((domain) => ({
        domain,
        accepted: true,
        classification: classifyEntityType(domain),
        relevance: 'direct',
        confidence: 0.5,
      }));
    }

    const aiResults = parsed.data.results;
    const resultsByDomain = new Map(aiResults.map((r) => [r.domain, r]));

    this.logger.info(
      { queryId, aiResultCount: aiResults.length, requestedCount: domains.length },
      'GroqQualifier: AI response parsed',
    );

    // ── Map AI results to QualificationResult ─────────────────────────────────
    return domains.map((domain) => {
      const ai = resultsByDomain.get(domain);

      if (!ai) {
        // AI didn't include this domain in its response — accept (unknown = safe)
        this.logger.debug({ queryId, domain }, 'GroqQualifier: domain not in AI response — accepting');
        return {
          domain,
          accepted: true,
          classification: classifyEntityType(domain),
          relevance: 'direct' as const,
          confidence: 0.5,
        };
      }

      // Apply asymmetric rejection threshold:
      // reject only when AI is confident the domain is irrelevant.
      const shouldReject =
        ai.relevance === 'irrelevant' &&
        ai.confidence >= IRRELEVANCE_REJECTION_THRESHOLD;

      const result: QualificationResult = {
        domain,
        accepted: !shouldReject,
        classification: ai.entityType,
        relevance: ai.relevance,
        confidence: ai.confidence,
      };

      if (shouldReject) {
        result.rejectionReason = `ai-irrelevant:${ai.entityType}`;
        result.rejectionStage  = 'ai-validation';
        this.logger.debug(
          { queryId, domain, entityType: ai.entityType, confidence: ai.confidence },
          'GroqQualifier: domain rejected as irrelevant',
        );
      }

      return result;
    });
  }
}
