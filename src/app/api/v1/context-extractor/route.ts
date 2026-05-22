import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getGroqClient, isGroqConfigured } from '@/lib/groq';
import { isServer } from '@/lib/environment';
import {
  ContextExtractorService,
  CheerioCrawler,
  PlaywrightCrawler,
  GroqAnalyzer,
  ContextExtractorInputSchema,
} from '@/modules/context-extractor/server';

const logger = createLogger('context-extractor:route');

function buildService(): ContextExtractorService {
  const cheerioCrawler = new CheerioCrawler(logger);
  const playwrightCrawler = new PlaywrightCrawler(logger);

  if (!isGroqConfigured()) {
    logger.warn('GROQ_API_KEY not configured — context extraction will return low-confidence fallback');
    // Return a service that can still crawl but has no AI analyzer
    // We create a passthrough analyzer that returns low-confidence defaults
    throw new Error('GROQ_API_KEY is required for context extraction. Set it in .env.');
  }

  const analyzer = new GroqAnalyzer(getGroqClient(), logger);
  return new ContextExtractorService(cheerioCrawler, analyzer, logger, { playwrightCrawler });
}

let service: ContextExtractorService;
try {
  service = buildService();
} catch (err) {
  logger.warn({ err }, 'Context extractor service could not be initialized');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = req.headers.get('x-request-id') ?? undefined;
  const logCtx = { requestId, path: req.nextUrl.pathname, runningIn: isServer() ? 'server' : 'client' };
  const headers: Record<string, string> = requestId ? { 'x-request-id': requestId } : {};

  logger.info(logCtx, 'ContextExtractor API route invoked');

  if (!service) {
    return NextResponse.json(
      { success: false, error: 'GROQ_API_KEY is required. Set it in .env to enable context extraction.' },
      { status: 503, headers },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const parsed = ContextExtractorInputSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ ...logCtx, issues: parsed.error.issues }, 'Validation failed');
    return NextResponse.json(
      { success: false, error: 'Validation failed', issues: parsed.error.issues },
      { status: 400, headers },
    );
  }

  try {
    const context = await service.run(parsed.data);
    return NextResponse.json({ success: true, data: context }, { status: 200, headers });
  } catch (error) {
    logger.error({ ...logCtx, error }, 'ContextExtractor route failed');
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500, headers });
  }
}
