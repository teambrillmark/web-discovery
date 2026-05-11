import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '@discovery/database';
import { AgentOrchestrator } from '../services/agent-orchestrator';
import { jobRegistry } from '../services/job-registry';
import type { AgentEvent } from '../agents/types';

export const crawlRouter = Router();

// POST /api/crawl/run — start multi-agent discovery, returns { jobId } immediately
crawlRouter.post('/run', async (req, res) => {
  const { queryId, raw } = req.body as { queryId?: string; raw?: string };

  if (!queryId && !raw) {
    return res.status(400).json({ error: 'queryId or raw query required' });
  }

  const jobId = randomUUID();
  jobRegistry.create(jobId);

  // Return immediately so the client can open the SSE stream
  res.json({ status: 'started', jobId, message: 'Multi-agent discovery started' });

  const orchestrator = new AgentOrchestrator();
  orchestrator.run(raw ?? '', jobId, queryId).catch(err => {
    console.error('[Crawl] AgentOrchestrator error:', err.message);
    jobRegistry.error(jobId, err.message);
  });
});

// GET /api/crawl/stream/:jobId — SSE stream for real-time agent progress
crawlRouter.get('/stream/:jobId', (req, res) => {
  const { jobId } = req.params;
  const emitter = jobRegistry.get(jobId);

  if (!emitter) {
    // Send one error event and close — don't return 404 (SSE client can't read status codes easily)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Job not found or expired', progress: 0 })}\n\n`);
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: Record<string, unknown>) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  // Forward all agent progress events to the SSE stream
  const onProgress = (event: AgentEvent) => send(event as unknown as Record<string, unknown>);
  const onDone = (data: Record<string, unknown>) => {
    send({ type: 'done', stage: 'complete', agent: 'Orchestrator', message: 'Discovery complete', progress: 100, data });
    res.end();
  };
  const onError = ({ message }: { message: string }) => {
    send({ type: 'error', stage: 'complete', agent: 'Orchestrator', message, progress: 0 });
    res.end();
  };

  emitter.on('progress', onProgress);
  emitter.on('done', onDone);
  emitter.on('error', onError);

  // Keepalive comment every 20s to prevent proxy timeouts
  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepalive); }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepalive);
    emitter.off('progress', onProgress);
    emitter.off('done', onDone);
    emitter.off('error', onError);
  });
});

// GET /api/crawl/logs — raw DB crawl logs (still used by QueryHistory)
crawlRouter.get('/logs', async (req, res) => {
  const { queryId } = req.query as { queryId?: string };
  const logs = await db.crawlLog.findMany({
    where: queryId ? { queryId } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

// GET /api/crawl/status — aggregate crawl stats
crawlRouter.get('/status', async (_req, res) => {
  const [total, success, failed, pending] = await Promise.all([
    db.crawlLog.count(),
    db.crawlLog.count({ where: { status: 'success' } }),
    db.crawlLog.count({ where: { status: 'failed' } }),
    db.crawlLog.count({ where: { status: 'pending' } }),
  ]);
  res.json({ total, success, failed, pending });
});
