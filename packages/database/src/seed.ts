import { db } from './client';

async function seed() {
  console.log('🌱 Seeding database with demo data...');

  // Seed example entities
  const entities = [
    {
      name: 'Brillmark',
      domain: 'brillmark.com',
      description: 'Leading CRO and A/B testing agency specializing in Shopify and ecommerce optimization',
      services: JSON.stringify(['CRO', 'A/B Testing', 'Shopify Optimization', 'UX Design']),
      technologies: JSON.stringify(['Optimizely', 'VWO', 'Google Optimize', 'Shopify']),
      category: 'cro_agency',
      entityType: 'company',
      confidenceScore: 0.95,
      relevanceScore: 1.0,
      source: 'seed',
    },
    {
      name: 'ConversionXL',
      domain: 'cxl.com',
      description: 'Top CRO training and agency platform',
      services: JSON.stringify(['CRO Training', 'Conversion Optimization', 'UX Research']),
      technologies: JSON.stringify(['Optimizely', 'Hotjar']),
      category: 'cro_agency',
      entityType: 'company',
      confidenceScore: 0.92,
      relevanceScore: 0.95,
      source: 'seed',
    },
    {
      name: 'Speero',
      domain: 'speero.com',
      description: 'CRO agency focused on data-driven experimentation',
      services: JSON.stringify(['CRO', 'Experimentation', 'Analytics']),
      technologies: JSON.stringify(['Optimizely', 'VWO']),
      category: 'cro_agency',
      entityType: 'company',
      confidenceScore: 0.88,
      relevanceScore: 0.90,
      source: 'seed',
    },
  ];

  for (const entity of entities) {
    await db.entity.upsert({
      where: { domain: entity.domain },
      update: entity,
      create: entity,
    });
  }

  // Seed a demo query
  const query = await db.query.create({
    data: {
      raw: 'Find competitors of brillmark.com',
      intent: 'competitor_analysis',
      industry: 'cro_agency',
      entityType: 'company',
      keywords: JSON.stringify(['cro', 'shopify', 'optimization', 'experimentation']),
      objective: 'Discover direct competitors in CRO space',
    },
  });

  console.log(`✅ Seeded ${entities.length} entities and 1 demo query`);
  console.log(`   Query ID: ${query.id}`);

  await db.$disconnect();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
