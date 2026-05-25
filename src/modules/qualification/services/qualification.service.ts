// Qualification service — orchestrates the qualification pipeline.
//
// Pipeline:
//   1. Rule filter — O(1) hash lookup, catches obvious rejections (community,
//      job boards, app stores, etc.) without any API calls.
//   2. Entity classification — pattern-based labels for rule-passed candidates.
//      Prepares them for AI validation.
//   3. AI validation — single batched Groq call for remaining candidates.
//      Only rejects when confident (>= 0.70) that a domain is irrelevant.
//
// WHY qualification comes before deduplication:
//   Deduplication persists to the competitors table which feeds the exclusion
//   list. A persisted non-competitor blocks FUTURE discovery of that slot
//   (the exclusion check prevents it from being re-discovered). Qualifying
//   before persisting keeps the exclusion list clean — only real competitors
//   consume exclusion slots.
//
// WHY rejected candidates are stored:
//   1. Avoid reprocessing the same junk on every run for the same company.
//   2. Provider quality analysis — which providers surface the most noise?
//   3. Audit trail for qualification decisions.

import type Groq from 'groq-sdk';
import type { Logger } from '../../../lib/logger';
import type {
  QualificationCandidate,
  QualificationContext,
  QualificationOutput,
  QualificationResult,
  QualificationStats,
  RejectedCandidateRecord,
  EntityType,
} from '../types';
import type { NormalizedResult } from '../../result-collector/types';
import { applyRuleFilter } from '../rules/rule-filter';
import { classifyEntityType } from '../classifiers/entity-classifier';
import { GroqQualifier } from '../ai/groq.qualifier';
import type { IRejectedCandidateRepository } from '../persistence/rejected.repository';

export class QualificationService {
  private readonly groqQualifier: GroqQualifier | null;

  constructor(
    private readonly repo: IRejectedCandidateRepository,
    private readonly logger: Logger,
    groqClient: Groq | null = null,
  ) {
    this.groqQualifier = groqClient ? new GroqQualifier(groqClient, logger) : null;
  }

  async qualify(
    candidates: QualificationCandidate[],
    context: QualificationContext | undefined,
    queryId: string,
  ): Promise<QualificationOutput> {
    const logCtx = { queryId, inputCount: candidates.length };
    this.logger.info(logCtx, 'QualificationService: started');

    const rejectedRecords: RejectedCandidateRecord[] = [];
    const rulePassedCandidates: QualificationCandidate[] = [];

    // ── STAGE 1: Rule-based filtering ─────────────────────────────────────────
    for (const candidate of candidates) {
      const filterResult = applyRuleFilter(candidate.normalizedDomain);

      if (!filterResult.passed) {
        const r = filterResult.result;
        this.logger.debug(
          { queryId, domain: candidate.normalizedDomain, reason: r.rejectionReason, stage: 'rule-filter' },
          'QualificationService: rule rejection',
        );
        rejectedRecords.push({
          domain:          candidate.normalizedDomain,
          queryId,
          rejectionReason: r.rejectionReason ?? 'rule-filter',
          rejectionStage:  'rule-filter',
          classification:  r.classification,
          relevance:       r.relevance,
          confidence:      r.confidence,
          provider:        candidate.source,
          rejectedAt:      new Date().toISOString(),
        });
      } else {
        rulePassedCandidates.push(candidate);
      }
    }

    this.logger.info(
      {
        queryId,
        total:         candidates.length,
        ruleRejected:  rejectedRecords.length,
        rulePassedCount: rulePassedCandidates.length,
      },
      'QualificationService: rule filter complete',
    );

    // ── STAGE 2: AI validation ────────────────────────────────────────────────
    const acceptedCandidates: NormalizedResult[] = [];

    if (rulePassedCandidates.length === 0) {
      // Nothing survived rules — skip AI call entirely
    } else if (!this.groqQualifier || !context) {
      // No AI configured or no context available — accept all rule-passers
      if (!this.groqQualifier) {
        this.logger.warn(
          { queryId },
          'QualificationService: Groq not configured — skipping AI validation, accepting all rule-passed candidates',
        );
      }
      acceptedCandidates.push(...rulePassedCandidates);
    } else {
      const domains = rulePassedCandidates.map((c) => c.normalizedDomain);
      let aiResults: QualificationResult[] = [];
      try {
        aiResults = await this.groqQualifier.qualify(domains, context, queryId);
      } catch (err) {
        this.logger.error({ queryId, error: err }, 'QualificationService: AI qualification failed — accepting all rule-passed');
        acceptedCandidates.push(...rulePassedCandidates);
        aiResults = [];
      }

      const aiResultMap = new Map(aiResults.map((r) => [r.domain, r]));

      for (const candidate of rulePassedCandidates) {
        const ai = aiResultMap.get(candidate.normalizedDomain);

        if (!ai || ai.accepted) {
          acceptedCandidates.push(candidate);
        } else {
          this.logger.debug(
            {
              queryId,
              domain: candidate.normalizedDomain,
              reason: ai.rejectionReason,
              confidence: ai.confidence,
            },
            'QualificationService: AI rejection',
          );
          rejectedRecords.push({
            domain:          candidate.normalizedDomain,
            queryId,
            rejectionReason: ai.rejectionReason ?? 'ai-irrelevant',
            rejectionStage:  'ai-validation',
            classification:  ai.classification,
            relevance:       ai.relevance,
            confidence:      ai.confidence,
            provider:        candidate.source,
            rejectedAt:      new Date().toISOString(),
          });
        }
      }
    }

    // ── Persist rejected candidates ───────────────────────────────────────────
    if (rejectedRecords.length > 0) {
      await this.repo.saveMany(rejectedRecords);
    }

    // ── Build stats ───────────────────────────────────────────────────────────
    const stats = buildStats(candidates, acceptedCandidates, rejectedRecords);

    this.logger.info(
      {
        queryId,
        total:              stats.totalInput,
        accepted:           stats.accepted,
        rejected:           stats.rejected,
        rejectedByRules:    stats.rejectedByRules,
        rejectedByAI:       stats.rejectedByAI,
        directCompetitors:  stats.directCompetitors,
        adjacentCompetitors: stats.adjacentCompetitors,
        rejectionReasons:   stats.rejectionReasons,
        classificationBreakdown: stats.classificationBreakdown,
      },
      'QualificationService: complete',
    );

    return { accepted: acceptedCandidates, rejected: rejectedRecords, stats };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildStats(
  all: QualificationCandidate[],
  accepted: NormalizedResult[],
  rejected: RejectedCandidateRecord[],
): QualificationStats {
  const rejectedByRules = rejected.filter((r) => r.rejectionStage === 'rule-filter').length;
  const rejectedByAI    = rejected.filter((r) => r.rejectionStage === 'ai-validation').length;

  const rejectionReasons: Record<string, number> = {};
  for (const r of rejected) {
    rejectionReasons[r.rejectionReason] = (rejectionReasons[r.rejectionReason] ?? 0) + 1;
  }

  // For classification breakdown, combine accepted (use entity classifier) and rejected.
  const classificationBreakdown: Partial<Record<EntityType, number>> = {};

  for (const r of rejected) {
    const t = r.classification;
    classificationBreakdown[t] = (classificationBreakdown[t] ?? 0) + 1;
  }
  for (const c of accepted) {
    const t = classifyEntityType(c.normalizedDomain);
    classificationBreakdown[t] = (classificationBreakdown[t] ?? 0) + 1;
  }

  // Direct / adjacent counts come from accepted candidates only
  // (rejected ones are irrelevant by definition).
  // We don't have AI relevance for accepted rule-passers unless we stored it,
  // so we approximate: agency/saas = direct, others = adjacent.
  let directCompetitors  = 0;
  let adjacentCompetitors = 0;
  for (const c of accepted) {
    const entityType = classifyEntityType(c.normalizedDomain);
    if (entityType === 'agency' || entityType === 'saas' || entityType === 'unknown') {
      directCompetitors++;
    } else {
      adjacentCompetitors++;
    }
  }

  return {
    totalInput:          all.length,
    accepted:            accepted.length,
    rejected:            rejected.length,
    rejectedByRules,
    rejectedByAI,
    directCompetitors,
    adjacentCompetitors,
    rejectionReasons,
    classificationBreakdown,
  };
}
