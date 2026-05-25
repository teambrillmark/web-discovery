import { NextRequest, NextResponse } from 'next/server';
import {
  DeduplicationService,
  DiscoveryInputSchema,
  DiscoveryService,
  GroqAIProvider,
  StubSearchProvider,
  ListicleExtractionProvider,
  type IDiscoveryProvider,
} from '@/modules/discovery/index';
import { ResultCollectorService } from '@/modules/result-collector';
import { DeduplicationEngineService, CompetitorDedupRepository } from '@/modules/deduplication';
import { QualificationService, RejectedCandidateRepository } from '@/modules/qualification';
import type { QualificationContext } from '@/modules/qualification';
import { ProfilingService, ProfileRepository, type ProfilingTargetContext } from '@/modules/profiling';
import { createLogger } from '@/lib/logger';
import { getGroqClient, isGroqConfigured } from '@/lib/groq';
import { getPrismaClient } from '@/lib/prisma';
import { isServer } from '@/lib/environment';

const logger = createLogger('discovery:route');

// ── Discovery providers ───────────────────────────────────────────────────────
const providers: IDiscoveryProvider[] = [];

if (isGroqConfigured()) {
  providers.push(new GroqAIProvider(getGroqClient(), logger));
  logger.info({ provider: 'groq' }, 'Groq AI discovery provider enabled');
} else {
  logger.warn('GROQ_API_KEY not configured — Groq AI provider disabled.');
}

providers.push(new StubSearchProvider(logger));
providers.push(new ListicleExtractionProvider(logger));

// ── Service instances ─────────────────────────────────────────────────────────
const prisma = getPrismaClient();
const deduplicationService = new DeduplicationService(logger);
const resultCollector      = new ResultCollectorService(logger);
const service              = new DiscoveryService(providers, deduplicationService, logger, resultCollector);
const competitorDedupRepo  = new CompetitorDedupRepository(prisma, logger);
const deduplicationEngine  = new DeduplicationEngineService(prisma, competitorDedupRepo, logger);
const rejectedRepo         = new RejectedCandidateRepository(prisma, logger);
const profileRepo          = new ProfileRepository(prisma, logger);

const groqClient = isGroqConfigured() ? getGroqClient() : null;

const qualificationService = new QualificationService(rejectedRepo, logger, groqClient);
const profilingService     = new ProfilingService(profileRepo, logger, groqClient);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? undefined;
  const logCtx = { requestId, path: req.nextUrl.pathname, runningIn: isServer() ? 'server' : 'client' };

  logger.info(logCtx, 'Discovery API route invoked');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  }

  const parsed = DiscoveryInputSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ ...logCtx, issues: parsed.error.issues }, 'Validation failed');
    return NextResponse.json(
      { success: false, error: 'Validation failed', issues: parsed.error.issues },
      { status: 400, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  }

  try {
    // ── Step 1: Discovery providers + result collection ────────────────────
    const discoveredCompetitors = await service.run(parsed.data);

    const qualificationCandidates = discoveredCompetitors.map((c) => ({
      normalizedDomain: c.domain,
      originalValue:    c.domain,
      source:           c.source,
      discoveryMethod:  c.discoveryMethod,
      queryId:          c.queryId,
      discoveredAt:     c.discoveredAt,
    }));

    // ── Step 2: Qualification layer ────────────────────────────────────────
    const bctx = parsed.data.businessContext;
    const qualificationContext: QualificationContext | undefined = bctx
      ? {
          primaryCompetitiveIdentity: bctx.primaryCompetitiveIdentity ?? 'Unknown',
          primarySpecialties:         bctx.primarySpecialties ?? [],
          industry:                   bctx.industry,
          niche:                      bctx.niche,
        }
      : undefined;

    const qualificationResult = await qualificationService.qualify(
      qualificationCandidates,
      qualificationContext,
      parsed.data.queryId,
    );

    // ── Step 3: Deduplication + DB persistence (qualified only) ───────────
    const deduplicationResult = await deduplicationEngine.process(
      qualificationResult.accepted.map((c) => ({
        normalizedDomain: c.normalizedDomain,
        originalValue:    c.originalValue,
        source:           c.source,
        discoveryMethod:  c.discoveryMethod,
        queryId:          c.queryId,
        discoveredAt:     c.discoveredAt,
      })),
    );

    // ── Step 4: Profile extraction + relevance scoring + ranking ──────────
    // Requires businessContext. Without it, profiling is skipped and competitors
    // are returned unranked (score = 0, profilingSkipped = true).
    const acceptedDomains = qualificationResult.accepted.map((c) => c.normalizedDomain);

    // Build ProfilingTargetContext from the incoming businessContext + normalizedDomain.
    // The discovery validator's businessContext omits domain/queryId/analyzedAt, so we
    // add domain here. The profiling module doesn't need the other metadata fields.
    const profilingContext: ProfilingTargetContext | undefined = bctx
      ? {
          domain:                     parsed.data.normalizedDomain,
          companyType:                bctx.companyType,
          industry:                   bctx.industry,
          niche:                      bctx.niche,
          primaryCompetitiveIdentity: bctx.primaryCompetitiveIdentity ?? 'Unknown',
          primarySpecialties:         bctx.primarySpecialties ?? [],
          coreServices:               bctx.coreServices ?? [],
          targetAudience:             bctx.targetAudience ?? [],
          positioningSummary:         bctx.positioningSummary ?? '',
          confidence:                 bctx.confidence,
        }
      : undefined;

    const profilingResult = profilingContext
      ? await profilingService.profile({
          domains:       acceptedDomains,
          targetContext: profilingContext,
          queryId:       parsed.data.queryId,
        })
      : {
          rankedCompetitors:  [],
          profilesExtracted:  0,
          profilingSkipped:   true,
          profilingStats: {
            totalInput: acceptedDomains.length, profilesExtracted: 0,
            highRelevance: 0, mediumRelevance: 0, lowRelevance: 0, averageScore: 0,
          },
        };

    logger.info(
      {
        ...logCtx,
        queryId:             parsed.data.queryId,
        totalDiscovered:     discoveredCompetitors.length,
        qualifiedAccepted:   qualificationResult.stats.accepted,
        qualifiedRejected:   qualificationResult.stats.rejected,
        newCompetitors:      deduplicationResult.stats.newCount,
        existingCompetitors: deduplicationResult.stats.existingCount,
        highRelevance:       profilingResult.profilingStats.highRelevance,
        avgScore:            profilingResult.profilingStats.averageScore,
      },
      'Discovery pipeline complete',
    );

    // Build a lookup map from domain → source info for the ranked list
    const sourceByDomain = new Map(
      qualificationResult.accepted.map((c) => [c.normalizedDomain, {
        source:          c.source,
        discoveryMethod: c.discoveryMethod,
        discoveredAt:    c.discoveredAt,
      }]),
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          // Ranked competitor list — sorted by relevance score descending
          rankedCompetitors: profilingResult.rankedCompetitors.map((r) => {
            const src = sourceByDomain.get(r.domain);
            return {
              domain:           r.domain,
              source:           src?.source ?? 'unknown',
              discoveryMethod:  src?.discoveryMethod ?? 'unknown',
              discoveredAt:     src?.discoveredAt ?? new Date().toISOString(),
              queryId:          parsed.data.queryId,
              relevanceScore:   r.relevanceScore,
              scoreConfidence:  r.scoreConfidence,
              matchedSignals:   r.matchedSignals,
              scoringReasoning: r.scoringReasoning,
              profile: {
                companyType:                r.profile.companyType,
                industry:                   r.profile.industry,
                niche:                      r.profile.niche,
                primaryCompetitiveIdentity: r.profile.primaryCompetitiveIdentity,
                primarySpecialties:         r.profile.primarySpecialties,
                targetAudience:             r.profile.targetAudience,
                aiConfidence:               r.profile.aiConfidence,
              },
            };
          }),
          // Legacy flat list for backward compatibility
          competitors: qualificationResult.accepted.map((c) => ({
            domain:          c.normalizedDomain,
            source:          c.source,
            discoveryMethod: c.discoveryMethod,
            discoveredAt:    c.discoveredAt,
            queryId:         c.queryId,
          })),
          newCompetitors:      deduplicationResult.newCompetitors,
          existingCompetitors: deduplicationResult.existingCompetitors,
          discoveredCount:     qualificationResult.stats.accepted,
          queryId:             parsed.data.queryId,
          providersActive:     providers.map((p) => p.name),
          deduplicationStats:  deduplicationResult.stats,
          qualificationStats:  qualificationResult.stats,
          profilingStats:      profilingResult.profilingStats,
        },
      },
      { status: 200, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  } catch (error) {
    logger.error({ ...logCtx, error }, 'Discovery route failed');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  }
}
