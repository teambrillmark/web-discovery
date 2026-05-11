import { Router } from 'express';
import { db } from '@discovery/database';
import { QueryAnalyzer } from '@discovery/extraction';

export const queriesRouter = Router();
const analyzer = new QueryAnalyzer();

queriesRouter.get('/', async (req, res) => {
  const queries = await db.query.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(queries);
});

queriesRouter.post('/', async (req, res) => {
  const { raw } = req.body as { raw: string };
  if (!raw?.trim()) {
    return res.status(400).json({ error: 'Query text is required' });
  }

  const analyzed = analyzer.analyze(raw);
  const query = await db.query.create({
    data: {
      raw: analyzed.raw,
      intent: analyzed.intent,
      industry: analyzed.industry,
      entityType: analyzed.entityType,
      location: analyzed.location,
      keywords: JSON.stringify(analyzed.keywords),
      objective: analyzed.objective,
    },
  });

  res.json({ query, analyzed });
});

queriesRouter.get('/:id', async (req, res) => {
  const query = await db.query.findUnique({
    where: { id: req.params.id },
    include: { entities: { include: { entity: true } }, crawlLogs: true },
  });
  if (!query) return res.status(404).json({ error: 'Query not found' });
  res.json(query);
});
