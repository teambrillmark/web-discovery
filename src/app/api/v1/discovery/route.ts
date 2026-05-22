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
import { createLogger } from '@/lib/logger';
import { getGroqClient, isGroqConfigured } from '@/lib/groq';
import { getPrismaClient } from '@/lib/prisma';
import { isServer } from '@/lib/environment';

const logger = createLogger('discovery:route');

const providers: IDiscoveryProvider[] = [];

if (isGroqConfigured()) {
  providers.push(new GroqAIProvider(getGroqClient(), logger));
  logger.info({ provider: 'groq' }, 'Groq AI discovery provider enabled');
} else {
  logger.warn('GROQ_API_KEY not configured — Groq AI provider disabled. Set GROQ_API_KEY to enable AI discovery.');
}

providers.push(new StubSearchProvider(logger));
providers.push(new ListicleExtractionProvider(logger));
logger.info({ provider: 'listicle-extraction' }, 'Listicle extraction provider enabled');

const deduplicationService = new DeduplicationService(logger);
const resultCollector = new ResultCollectorService(logger);
const service = new DiscoveryService(providers, deduplicationService, logger, resultCollector);

const prisma = getPrismaClient();
const competitorDedupRepo = new CompetitorDedupRepository(prisma, logger);
const deduplicationEngine = new DeduplicationEngineService(prisma, competitorDedupRepo, logger);

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
    // Step 1: Discover competitors via providers + result collector
    const discoveredCompetitors = await service.run(parsed.data);

    // Step 2: Persist to DB — deduplication engine separates new vs existing
    // and records every discovery event for historical intelligence
    const deduplicationResult = await deduplicationEngine.process(
      discoveredCompetitors.map((c) => ({
        normalizedDomain: c.domain,
        originalValue: c.domain,
        source: c.source,
        discoveryMethod: c.discoveryMethod,
        queryId: c.queryId,
        discoveredAt: c.discoveredAt,
      })),
    );

    logger.info(
      {
        ...logCtx,
        queryId: parsed.data.queryId,
        totalDiscovered: discoveredCompetitors.length,
        newCompetitors: deduplicationResult.stats.newCount,
        existingCompetitors: deduplicationResult.stats.existingCount,
      },
      'Discovery and deduplication complete',
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          competitors: discoveredCompetitors,
          newCompetitors: deduplicationResult.newCompetitors,
          existingCompetitors: deduplicationResult.existingCompetitors,
          discoveredCount: discoveredCompetitors.length,
          queryId: parsed.data.queryId,
          providersActive: providers.map((p) => p.name),
          deduplicationStats: deduplicationResult.stats,
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
