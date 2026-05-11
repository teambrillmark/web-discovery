import { Router } from 'express';
import { db } from '@discovery/database';

export const exportRouter = Router();

exportRouter.get('/csv', async (req, res) => {
  const { queryId } = req.query as { queryId?: string };

  const where: any = { isValid: true };
  if (queryId) {
    where.queries = { some: { queryId } };
  }

  const entities = await db.entity.findMany({
    where,
    orderBy: { confidenceScore: 'desc' },
    take: 1000,
  });

  const rows = entities.map(e => ({
    name: e.name,
    domain: e.domain,
    description: e.description ?? '',
    category: e.category ?? '',
    services: e.services ? JSON.parse(e.services).join('; ') : '',
    technologies: e.technologies ? JSON.parse(e.technologies).join('; ') : '',
    linkedin: e.linkedin ?? '',
    emails: e.emails ? JSON.parse(e.emails).join('; ') : '',
    confidenceScore: e.confidenceScore.toFixed(2),
    relevanceScore: e.relevanceScore.toFixed(2),
    firstSeen: e.firstSeen.toISOString(),
    lastSeen: e.lastSeen.toISOString(),
    source: e.source ?? '',
  }));

  const headers = Object.keys(rows[0] ?? {}).join(',');
  const csvRows = rows.map(row =>
    Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  const csv = [headers, ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="discovery-export-${Date.now()}.csv"`);
  res.send(csv);
});

exportRouter.get('/json', async (req, res) => {
  const entities = await db.entity.findMany({
    where: { isValid: true },
    orderBy: { confidenceScore: 'desc' },
    take: 1000,
  });

  const data = entities.map(e => ({
    ...e,
    services: e.services ? JSON.parse(e.services) : [],
    technologies: e.technologies ? JSON.parse(e.technologies) : [],
    founders: e.founders ? JSON.parse(e.founders) : [],
    emails: e.emails ? JSON.parse(e.emails) : [],
    locations: e.locations ? JSON.parse(e.locations) : [],
  }));

  res.setHeader('Content-Disposition', `attachment; filename="discovery-export-${Date.now()}.json"`);
  res.json(data);
});
