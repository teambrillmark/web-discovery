// Profiling service — orchestrates the full profiling + ranking pipeline.
//
// Pipeline:
//   1. Groq batch profiler — extracts a structured profile for each competitor
//      from the LLM's world knowledge (ONE API call for the whole batch)
//   2. Deterministic scorer — computes a 0–100 relevance score for each
//      competitor by comparing its profile against the target's profile
//   3. Ranking — sorts by score descending, tie-broken by profile confidence
//   4. Persistence — stores profiles + scores to competitor_profiles table
//
// WHY separate profiling from qualification?
//   Qualification answers "is this a competitor?" (binary)
//   Profiling answers "how relevant a competitor?" (weighted 0–100)
//   They use different AI prompts, different outputs, and serve different purposes.
//
// WHY not skip profiling when Groq is unavailable?
//   We still run the scoring step — it just uses empty profiles, so all competitors
//   score 0 and ranking is undefined. The response still includes a ranked list
//   (all tied at 0) with `profilingSkipped: true` so the frontend can handle it.

import type Groq from 'groq-sdk';
import type { Logger } from '../../../lib/logger';
import type {
  CompetitorProfile,
  ProfilingInput,
  ProfilingOutput,
  ProfilingStats,
  StoredProfile,
  ScoringResult,
} from '../types';
import { contextToProfile } from '../types';
import { GroqProfiler } from '../ai/groq.profiler';
import { rankCompetitors, profileCompleteness, normalizedSpecialtyDiff } from '../scoring/scorer';
import type { IProfileRepository } from '../persistence/profile.repository';

export class ProfilingService {
  private readonly profiler: GroqProfiler | null;

  constructor(
    private readonly repo: IProfileRepository,
    private readonly logger: Logger,
    groqClient: Groq | null = null,
  ) {
    this.profiler = groqClient ? new GroqProfiler(groqClient, logger) : null;
  }

  async profile(input: ProfilingInput): Promise<ProfilingOutput> {
    const { domains, targetContext, queryId } = input;
    const logCtx = { queryId, inputCount: domains.length };
    this.logger.info(logCtx, 'ProfilingService: started');

    if (domains.length === 0) {
      return emptyOutput();
    }

    const targetProfile = contextToProfile(targetContext);

    // ── STEP 1: Extract competitor profiles via Groq ──────────────────────────
    let competitorProfiles: CompetitorProfile[] = domains.map((domain) => ({
      domain,
      companyType:                null,
      industry:                   null,
      niche:                      null,
      primaryCompetitiveIdentity: null,
      primarySpecialties:         [],
      coreServices:               [],
      targetAudience:             [],
      positioning:                null,
      aiConfidence:               'low' as const,
    }));

    const profilingSkipped = !this.profiler;

    if (this.profiler) {
      try {
        competitorProfiles = await this.profiler.profileBatch(domains, targetContext, queryId);
        this.logger.info(
          { queryId, profilesExtracted: competitorProfiles.length },
          'ProfilingService: profiles extracted',
        );
      } catch (err) {
        this.logger.error({ queryId, error: err }, 'ProfilingService: profiling failed — scoring with empty profiles');
      }
    } else {
      this.logger.warn({ queryId }, 'ProfilingService: Groq not configured — scoring with empty profiles, all scores will be 0');
    }

    // ── STEP 2: Deterministic scoring + ranking ───────────────────────────────
    const rankedCompetitors: ScoringResult[] = rankCompetitors(targetProfile, competitorProfiles);

    this.logger.info(
      {
        queryId,
        ranked:   rankedCompetitors.length,
        topScore: rankedCompetitors[0]?.relevanceScore ?? 0,
        topDomain: rankedCompetitors[0]?.domain ?? 'none',
      },
      'ProfilingService: ranking complete',
    );

    // Log top 5 for observability — includes completeness and normalization diffs
    for (const result of rankedCompetitors.slice(0, 5)) {
      const completeness = profileCompleteness(result.profile);
      const normalizations = normalizedSpecialtyDiff(result.profile.primarySpecialties);
      this.logger.debug(
        {
          queryId,
          domain:           result.domain,
          score:            result.relevanceScore,
          confidence:       result.scoreConfidence,
          completeness:     Math.round(completeness * 100),
          reasoning:        result.scoringReasoning,
          normalizations:   normalizations.length > 0 ? normalizations : undefined,
          signals: {
            specialty:    result.matchedSignals.specialtyOverlap,
            identity:     result.matchedSignals.identitySimilarity,
            businessType: result.matchedSignals.businessTypeMatch,
            industry:     result.matchedSignals.industryMatch,
            audience:     result.matchedSignals.audienceOverlap,
          },
        },
        'ProfilingService: ranked competitor',
      );
    }

    // Log semantic normalization applied to target's specialties for audit trail
    const targetNorms = normalizedSpecialtyDiff(targetProfile.primarySpecialties ?? []);
    if (targetNorms.length > 0) {
      this.logger.info(
        { queryId, normalizations: targetNorms },
        'ProfilingService: semantic normalization applied to target specialties',
      );
    }

    // ── STEP 3: Persist profiles ──────────────────────────────────────────────
    const recordsToSave: StoredProfile[] = rankedCompetitors.map((r) => ({
      domain:                     r.domain,
      queryId,
      companyType:                r.profile.companyType,
      industry:                   r.profile.industry,
      niche:                      r.profile.niche,
      primaryCompetitiveIdentity: r.profile.primaryCompetitiveIdentity,
      primarySpecialties:         r.profile.primarySpecialties,
      coreServices:               r.profile.coreServices,
      targetAudience:             r.profile.targetAudience,
      positioning:                r.profile.positioning,
      aiConfidence:               r.profile.aiConfidence,
      relevanceScore:             r.relevanceScore,
      scoreConfidence:            r.scoreConfidence,
      matchedSignals:             r.matchedSignals,
      scoringReasoning:           r.scoringReasoning,
    }));

    await this.repo.saveMany(recordsToSave);

    const stats = buildStats(rankedCompetitors);

    this.logger.info(
      {
        queryId,
        total:          stats.totalInput,
        highRelevance:  stats.highRelevance,
        mediumRelevance: stats.mediumRelevance,
        lowRelevance:   stats.lowRelevance,
        averageScore:   stats.averageScore,
      },
      'ProfilingService: complete',
    );

    return {
      rankedCompetitors,
      profilesExtracted: competitorProfiles.filter((p) => p.aiConfidence !== 'low' || p.companyType !== null).length,
      profilingSkipped,
      profilingStats: stats,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildStats(ranked: ScoringResult[]): ProfilingStats {
  const total = ranked.length;
  const highRelevance   = ranked.filter((r) => r.relevanceScore >= 70).length;
  const mediumRelevance = ranked.filter((r) => r.relevanceScore >= 40 && r.relevanceScore < 70).length;
  const lowRelevance    = ranked.filter((r) => r.relevanceScore < 40).length;
  const averageScore    = total > 0
    ? Math.round(ranked.reduce((sum, r) => sum + r.relevanceScore, 0) / total)
    : 0;

  return { totalInput: total, profilesExtracted: total, highRelevance, mediumRelevance, lowRelevance, averageScore };
}

function emptyOutput(): ProfilingOutput {
  return {
    rankedCompetitors:  [],
    profilesExtracted:  0,
    profilingSkipped:   false,
    profilingStats: {
      totalInput: 0, profilesExtracted: 0,
      highRelevance: 0, mediumRelevance: 0, lowRelevance: 0, averageScore: 0,
    },
  };
}
