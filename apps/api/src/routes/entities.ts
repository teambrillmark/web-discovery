import { Router } from 'express';
import { db } from '@discovery/database';

export const entitiesRouter = Router();

entitiesRouter.get('/', async (req, res) => {
  const {
    queryId,
    search,
    sort = 'confidenceScore',
    order = 'desc',
    page = '1',
    limit = '20',
    minScore = '0',
  } = req.query as Record<string, string>;

  const where: any = {
    isValid: true,
    confidenceScore: { gte: parseFloat(minScore) },
  };

  // Filter by query — join through query_entities table
  if (queryId) {
    where.queries = { some: { queryId } };
  }

  // Full-text search across name / domain / description
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { domain: { contains: search } },
      { description: { contains: search } },
    ];
  }

  const validSortFields = ['name', 'domain', 'confidenceScore', 'relevanceScore', 'lastSeen', 'firstSeen', 'createdAt'];
  const sortField = validSortFields.includes(sort) ? sort : 'confidenceScore';

  const [total, entities] = await Promise.all([
    db.entity.count({ where }),
    db.entity.findMany({
      where,
      orderBy: { [sortField]: order === 'asc' ? 'asc' : 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: queryId ? {
        queries: { where: { queryId }, select: { isNew: true } },
      } : undefined,
    }),
  ]);

  res.json({
    entities: entities.map((e: any) => {
      const { queries: qLinks, ...rest } = e;
      return {
        ...rest,
        services: e.services ? JSON.parse(e.services) : [],
        technologies: e.technologies ? JSON.parse(e.technologies) : [],
        founders: e.founders ? JSON.parse(e.founders) : [],
        emails: e.emails ? JSON.parse(e.emails) : [],
        locations: e.locations ? JSON.parse(e.locations) : [],
        phones: e.phones ? JSON.parse(e.phones) : [],
        isNew: queryId ? (qLinks?.[0]?.isNew ?? null) : null,
        positioning: e.positioning ?? null,
        competitorTier: e.competitorTier ?? null,
      };
    }),
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

entitiesRouter.get('/:id', async (req, res) => {
  const entity = await db.entity.findUnique({
    where: { id: req.params.id },
    include: {
      snapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
      changes: { orderBy: { detectedAt: 'desc' }, take: 10 },
      validations: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!entity) return res.status(404).json({ error: 'Entity not found' });
  res.json(entity);
});
