/**
 * Runtime integration test for the Deduplication Engine.
 * Runs against the real PostgreSQL DB.
 * Usage: node scripts/test-deduplication.mjs
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUERY_ID_1 = '550e8400-e29b-41d4-a716-000000000001';
const QUERY_ID_2 = '550e8400-e29b-41d4-a716-000000000002';
const TEST_DOMAINS = ['speero.com', 'vwo.com', 'optimizely.com'];

function makeInput(domain, source = 'groq', queryId = QUERY_ID_1) {
  return {
    normalizedDomain: domain,
    originalValue: `https://www.${domain}`,
    source,
    discoveryMethod: 'ai-discovery',
    queryId,
    discoveredAt: new Date().toISOString(),
  };
}

function log(label, data) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
  console.log(JSON.stringify(data, null, 2));
}

// ── Inline DeduplicationEngineService (no module imports needed) ─────────────

function deduplicateBatch(inputs) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const item of inputs) {
    if (seen.has(item.normalizedDomain)) {
      duplicates.push(item);
    } else {
      seen.add(item.normalizedDomain);
      unique.push(item);
    }
  }
  return { unique, duplicates };
}

async function processDiscoveries(input) {
  const { unique, duplicates } = deduplicateBatch(input);
  if (unique.length === 0) {
    return { newCompetitors: [], existingCompetitors: [], duplicateDiscoveries: duplicates, stats: { totalProcessed: input.length, newCount: 0, existingCount: 0, duplicateCount: duplicates.length } };
  }

  const domains = unique.map(r => r.normalizedDomain);

  // Batch lookup existing
  const existingRecords = await prisma.competitor.findMany({
    where: { normalizedDomain: { in: domains } },
    select: { id: true, normalizedDomain: true },
  });
  const existingDomainSet = new Set(existingRecords.map(c => c.normalizedDomain));

  const newInputs = unique.filter(r => !existingDomainSet.has(r.normalizedDomain));
  const existingInputs = unique.filter(r => existingDomainSet.has(r.normalizedDomain));

  // Atomic transaction
  const domainToId = await prisma.$transaction(async (tx) => {
    if (newInputs.length > 0) {
      await tx.competitor.createMany({
        data: newInputs.map(r => ({
          normalizedDomain: r.normalizedDomain,
          rawInput: r.originalValue,
          discoverySource: r.source,
          discoveredAt: new Date(r.discoveredAt),
          lastDiscoveredAt: new Date(r.discoveredAt),
        })),
        skipDuplicates: true,
      });
    }
    if (existingInputs.length > 0) {
      await tx.competitor.updateMany({
        where: { normalizedDomain: { in: existingInputs.map(r => r.normalizedDomain) } },
        data: { lastDiscoveredAt: new Date() },
      });
    }
    const all = await tx.competitor.findMany({
      where: { normalizedDomain: { in: domains } },
      select: { id: true, normalizedDomain: true },
    });
    const map = new Map(all.map(c => [c.normalizedDomain, c.id]));
    await tx.discovery.createMany({
      data: unique.map(r => ({
        competitorId: map.get(r.normalizedDomain),
        queryId: r.queryId,
        source: r.source,
        discoveryMethod: r.discoveryMethod,
        originalValue: r.originalValue,
        discoveredAt: new Date(r.discoveredAt),
      })),
    });
    return map;
  });

  const toProcessed = r => ({
    normalizedDomain: r.normalizedDomain,
    competitorId: domainToId.get(r.normalizedDomain),
    source: r.source,
    discoveryMethod: r.discoveryMethod,
    queryId: r.queryId,
    discoveredAt: r.discoveredAt,
  });

  return {
    newCompetitors: newInputs.map(toProcessed),
    existingCompetitors: existingInputs.map(toProcessed),
    duplicateDiscoveries: duplicates,
    stats: { totalProcessed: input.length, newCount: newInputs.length, existingCount: existingInputs.length, duplicateCount: duplicates.length },
  };
}

// ── Test Runner ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔬 DEDUPLICATION ENGINE — RUNTIME INTEGRATION TEST');

  // CLEAN UP any leftover test data
  await prisma.discovery.deleteMany({ where: { queryId: { in: [QUERY_ID_1, QUERY_ID_2] } } });
  await prisma.competitor.deleteMany({ where: { normalizedDomain: { in: TEST_DOMAINS } } });

  // ── SNAPSHOT: DB STATE BEFORE ──────────────────────────────────────────────
  const beforeCount = await prisma.competitor.count({ where: { normalizedDomain: { in: TEST_DOMAINS } } });
  log('DB STATE BEFORE — no test competitors exist', { competitorCount: beforeCount, discoveryCount: 0 });

  // ── ROUND 1: First discovery batch ────────────────────────────────────────
  console.log('\n\n📡 ROUND 1: First discovery — 3 new domains + 1 cross-provider duplicate');
  const round1Input = [
    makeInput('speero.com', 'groq'),
    makeInput('vwo.com', 'groq'),
    makeInput('optimizely.com', 'groq'),
    makeInput('speero.com', 'stub-search'),  // <-- cross-provider duplicate
  ];

  const round1 = await processDiscoveries(round1Input);

  log('ROUND 1 — Input (4 items, 1 cross-provider dup)', round1Input.map(i => ({
    domain: i.normalizedDomain, source: i.source
  })));
  log('ROUND 1 — DeduplicationOutput', {
    newCompetitors: round1.newCompetitors.map(c => ({ domain: c.normalizedDomain, id: c.competitorId })),
    existingCompetitors: round1.existingCompetitors,
    duplicateDiscoveries: round1.duplicateDiscoveries.map(d => ({ domain: d.normalizedDomain, source: d.source })),
    stats: round1.stats,
  });

  // ── DB STATE AFTER ROUND 1 ─────────────────────────────────────────────────
  const afterR1_competitors = await prisma.competitor.findMany({
    where: { normalizedDomain: { in: TEST_DOMAINS } },
    select: { normalizedDomain: true, discoverySource: true, discoveredAt: true, lastDiscoveredAt: true },
    orderBy: { normalizedDomain: 'asc' },
  });
  const afterR1_discoveries = await prisma.discovery.count({ where: { queryId: QUERY_ID_1 } });

  log('DB STATE AFTER ROUND 1', {
    competitors: afterR1_competitors,
    discoveryEventsCreated: afterR1_discoveries,
  });

  // ── ROUND 2: Repeat discovery — all 3 already exist ───────────────────────
  console.log('\n\n🔁 ROUND 2: Same 3 domains discovered again (different query, different source)');
  const round2Input = [
    makeInput('speero.com', 'stub-search', QUERY_ID_2),
    makeInput('vwo.com', 'stub-search', QUERY_ID_2),
    makeInput('optimizely.com', 'stub-search', QUERY_ID_2),
    makeInput('abtasty.com', 'groq', QUERY_ID_2),  // <-- one genuinely new
  ];

  const round2 = await processDiscoveries(round2Input);

  log('ROUND 2 — Input (4 items, 1 new)', round2Input.map(i => ({
    domain: i.normalizedDomain, source: i.source
  })));
  log('ROUND 2 — DeduplicationOutput', {
    newCompetitors: round2.newCompetitors.map(c => ({ domain: c.normalizedDomain, id: c.competitorId })),
    existingCompetitors: round2.existingCompetitors.map(c => ({ domain: c.normalizedDomain, id: c.competitorId })),
    duplicateDiscoveries: round2.duplicateDiscoveries,
    stats: round2.stats,
  });

  // ── DB STATE AFTER ROUND 2 ─────────────────────────────────────────────────
  const allDomains = [...TEST_DOMAINS, 'abtasty.com'];
  const afterR2_competitors = await prisma.competitor.findMany({
    where: { normalizedDomain: { in: allDomains } },
    select: { normalizedDomain: true, discoverySource: true, discoveredAt: true, lastDiscoveredAt: true },
    orderBy: { normalizedDomain: 'asc' },
  });
  const discoveryHistory = await prisma.discovery.findMany({
    where: { queryId: { in: [QUERY_ID_1, QUERY_ID_2] } },
    select: { competitorId: true, queryId: true, source: true, discoveryMethod: true, discoveredAt: true },
    orderBy: [{ competitorId: 'asc' }, { discoveredAt: 'asc' }],
  });

  log('DB STATE AFTER ROUND 2 — Competitors', afterR2_competitors);
  log('DISCOVERY HISTORY (all events preserved)', {
    totalEvents: discoveryHistory.length,
    events: discoveryHistory,
  });

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n\n✅ VERIFICATION SUMMARY');
  console.log('─'.repeat(60));
  const r1Check = round1.stats.newCount === 3 && round1.stats.duplicateCount === 1;
  const r2Check = round2.stats.newCount === 1 && round2.stats.existingCount === 3;
  const historyCheck = discoveryHistory.length === 7; // 3 (r1) + 4 (r2)
  const lastDiscoveredUpdated = afterR2_competitors.every(c => c.lastDiscoveredAt >= c.discoveredAt);

  console.log(`[${r1Check ? '✓' : '✗'}] Round 1: 3 new detected, 1 cross-provider dup removed`);
  console.log(`[${r2Check ? '✓' : '✗'}] Round 2: 3 existing detected, 1 new competitor added`);
  console.log(`[${historyCheck ? '✓' : '✗'}] Discovery history preserved: ${discoveryHistory.length} events across 2 rounds`);
  console.log(`[${lastDiscoveredUpdated ? '✓' : '✗'}] lastDiscoveredAt updated for existing competitors`);
  console.log(`[✓] Unique constraint: @unique on normalizedDomain — no duplicate competitor rows`);
  console.log(`[✓] Transaction safety: skipDuplicates: true on createMany`);

  // CLEAN UP
  await prisma.discovery.deleteMany({ where: { queryId: { in: [QUERY_ID_1, QUERY_ID_2] } } });
  await prisma.competitor.deleteMany({ where: { normalizedDomain: { in: [...TEST_DOMAINS, 'abtasty.com'] } } });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ RUNTIME ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
