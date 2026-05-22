import { NextRequest, NextResponse } from 'next/server';
import {
  CompetitorRepository,
  DomainNormalizerService,
  InvalidDomainError,
  QueryEngineInputSchema,
  QueryEngineService,
} from '@/modules/query-engine/server';
import { getPrismaClient } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { isServer } from '@/lib/environment';

const logger = createLogger('query-engine:route');
const prisma = getPrismaClient();
const competitorRepository = new CompetitorRepository(prisma, logger);
const normalizer = new DomainNormalizerService(logger);
const service = new QueryEngineService(normalizer, competitorRepository, logger);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? undefined;
  const logCtx = { requestId, path: req.nextUrl.pathname };

  logger.info({ ...logCtx, runningIn: isServer() ? 'server' : 'client' }, 'QueryEngine API route invoked');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  }

  const parsed = QueryEngineInputSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ ...logCtx, issues: parsed.error.issues }, 'Validation failed');
    return NextResponse.json(
      { success: false, error: 'Validation failed', issues: parsed.error.issues },
      { status: 400, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  }

  try {
    const result = await service.run(parsed.data);
    return NextResponse.json(
      { success: true, data: result },
      { status: 200, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  } catch (error) {
    if (error instanceof InvalidDomainError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 400, headers: requestId ? { 'x-request-id': requestId } : {} },
      );
    }
    logger.error({ ...logCtx, error }, 'QueryEngine route failed');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: requestId ? { 'x-request-id': requestId } : {} },
    );
  }
}
