/**
 * Safe Intelligence Memory Reset
 *
 * PURPOSE:
 *   Clears competitor intelligence accumulated by the old (gen-1) discovery pipeline
 *   so the system can rebuild with the new (gen-2) competitive-intent-anchored pipeline.
 *
 * WHAT IT DOES:
 *   1. Takes a full JSON snapshot of current DB state (backup before any mutation)
 *   2. Logs exactly what will be deleted (counts, breakdown by source/version)
 *   3. Deletes discoveries first (FK child), then competitors (FK parent)
 *   4. Verifies the DB is clean after reset
 *   5. Writes the backup to data/intelligence-backup-<timestamp>.json
 *
 * SAFETY GUARANTEES:
 *   - Backup is written BEFORE any DELETE
 *   - Deletions run inside a single transaction — either both succeed or neither applies
 *   - FK cascade handles orphan prevention automatically
 *   - Schema (tables, indexes, migrations) is never touched
 *   - Prisma client state is unaffected
 *
 * WHAT IT DOES NOT DO:
 *   - Does not drop tables
 *   - Does not modify schema.prisma
 *   - Does not delete migrations
 *   - Does not affect Prisma client configuration
 *
 * USAGE:
 *   node scripts/reset-intelligence.mjs
 *   node scripts/reset-intelligence.mjs --dry-run    # show what would be deleted, no mutations
 *
 * WHY SAFE TRUNCATION OVER ARCHIVAL / STATUS TAGGING:
 *   The pipelineVersion=1 data is so noisy (ad networks, subdomains of EY, footwear retailers,
 *   agency directories from multiple ccTLDs, ChatGPT) that archival adds no value — we won't
 *   query these records again. A JSON backup preserves the history for audit/debug without
 *   polluting the live exclusion list that poisons every future discovery run.
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

const LINE = '─'.repeat(64);

function log(label, data) {
  console.log(`\n${LINE}`);
  console.log(`  ${label}`);
  console.log(LINE);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function logLine(msg) {
  console.log(`  ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(64));
  console.log('  INTELLIGENCE MEMORY RESET' + (isDryRun ? ' [DRY-RUN]' : ''));
  console.log('═'.repeat(64));

  // ── PHASE 1: Snapshot current state ──────────────────────────────────────
  log('PHASE 1 — Snapshotting current intelligence state');

  const competitorCount = await prisma.competitor.count();
  const discoveryCount  = await prisma.discovery.count();

  const bySource = await prisma.$queryRaw`
    SELECT "discoverySource", "pipelineVersion", COUNT(*)::int as cnt
    FROM competitors GROUP BY "discoverySource", "pipelineVersion"
    ORDER BY "pipelineVersion", cnt DESC
  `;

  const byVersion = await prisma.$queryRaw`
    SELECT "pipelineVersion", COUNT(*)::int as cnt
    FROM competitors GROUP BY "pipelineVersion" ORDER BY "pipelineVersion"
  `;

  const distinctRuns = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT "queryId")::int as runs FROM discoveries
  `;

  logLine(`competitors  : ${competitorCount}`);
  logLine(`discoveries  : ${discoveryCount}`);
  logLine(`distinct runs: ${distinctRuns[0]?.runs ?? 0}`);

  log('By source + pipeline version', bySource);
  log('By pipeline version', byVersion);

  if (competitorCount === 0) {
    logLine('Database is already empty — nothing to reset.');
    await prisma.$disconnect();
    return;
  }

  // ── PHASE 2: Full data export ─────────────────────────────────────────────
  log('PHASE 2 — Exporting full intelligence snapshot to JSON backup');

  const allCompetitors = await prisma.competitor.findMany({
    include: { discoveries: true },
    orderBy: { discoveredAt: 'asc' },
  });

  const backupPayload = {
    exportedAt: new Date().toISOString(),
    reason: 'intelligence-reset: clearing pipelineVersion=1 (gen-1) data before gen-2 rebuild',
    stats: {
      competitorCount,
      discoveryCount,
      distinctRuns: distinctRuns[0]?.runs ?? 0,
      bySource,
      byVersion,
    },
    competitors: allCompetitors,
  };

  const dataDir = join(__dirname, '..', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = join(dataDir, `intelligence-backup-${timestamp}.json`);

  if (!isDryRun) {
    writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');
    logLine(`Backup written to: ${backupPath}`);
  } else {
    logLine(`[DRY-RUN] Would write backup to: ${backupPath}`);
  }

  // ── PHASE 3: Safe truncation ──────────────────────────────────────────────
  log('PHASE 3 — Clearing intelligence tables (transaction)');

  if (isDryRun) {
    logLine('[DRY-RUN] Would DELETE all discovery events and competitor records');
    logLine(`[DRY-RUN] discoveries: ${discoveryCount} rows would be deleted`);
    logLine(`[DRY-RUN] competitors: ${competitorCount} rows would be deleted`);
    logLine('[DRY-RUN] No mutations applied — re-run without --dry-run to execute');
    await prisma.$disconnect();
    return;
  }

  logLine(`Deleting ${discoveryCount} discovery events and ${competitorCount} competitors...`);

  const { deletedDiscoveries, deletedCompetitors } = await prisma.$transaction(async (tx) => {
    // Delete child rows first to avoid FK violation (though CASCADE would handle it,
    // explicit ordering is safer and makes the intent clear in logs).
    const { count: deletedDiscoveries } = await tx.discovery.deleteMany({});
    const { count: deletedCompetitors } = await tx.competitor.deleteMany({});
    return { deletedDiscoveries, deletedCompetitors };
  });

  logLine(`Deleted ${deletedDiscoveries} discovery events`);
  logLine(`Deleted ${deletedCompetitors} competitor records`);

  // ── PHASE 4: Verify clean state ───────────────────────────────────────────
  log('PHASE 4 — Verifying clean DB state');

  const postCompetitorCount = await prisma.competitor.count();
  const postDiscoveryCount  = await prisma.discovery.count();

  logLine(`competitors after reset: ${postCompetitorCount}`);
  logLine(`discoveries after reset: ${postDiscoveryCount}`);

  const noOrphans = await prisma.$queryRaw`
    SELECT COUNT(*)::int as orphaned
    FROM discoveries d
    LEFT JOIN competitors c ON d."competitorId" = c.id
    WHERE c.id IS NULL
  `;

  const orphanCount = noOrphans[0]?.orphaned ?? 0;

  // ── PHASE 5: Summary ──────────────────────────────────────────────────────
  log('RESET SUMMARY');

  const allChecks = [
    { check: 'Backup written',             pass: true },
    { check: 'competitors table empty',    pass: postCompetitorCount === 0 },
    { check: 'discoveries table empty',    pass: postDiscoveryCount === 0  },
    { check: 'No orphaned discovery rows', pass: orphanCount === 0          },
  ];

  for (const { check, pass } of allChecks) {
    logLine(`[${pass ? '✓' : '✗'}] ${check}`);
  }

  const allPassed = allChecks.every(c => c.pass);

  console.log('\n' + '═'.repeat(64));
  console.log(allPassed
    ? '  ✓ RESET COMPLETE — DB clean, ready for gen-2 discovery rebuild'
    : '  ✗ RESET INCOMPLETE — check failures above');
  console.log('═'.repeat(64) + '\n');

  if (!allPassed) process.exit(1);
}

main()
  .catch(async (err) => {
    console.error('\n✗ FATAL ERROR during reset:', err.message);
    console.error(err.stack);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
