-- Migration: add_discoveries_pipeline_version
-- Resolves schema drift (discoveries table added via db push) and
-- introduces pipelineVersion for generation-aware intelligence tracking.
--
-- WHY pipelineVersion?
-- The discovery pipeline had two generations:
--   Gen 1: flat service discovery (pre-2026-05-22) → noisy, generic results
--   Gen 2: competitive-intent anchored (post-2026-05-22) → identity-first results
-- By tagging each competitor row with the generation that found it, future
-- architecture changes can reset or filter by generation without a full truncation.
--
-- WHY default = 2?
-- All existing rows get pipelineVersion = 1 (applied via the backfill UPDATE below).
-- All new rows from the gen-2 pipeline get the default of 2.
-- This lets exclusion queries optionally filter to version >= 2 in the future.

-- Step 1: Add pipelineVersion column (default 2 for new discoveries)
ALTER TABLE "competitors" ADD COLUMN IF NOT EXISTS "pipelineVersion" INTEGER NOT NULL DEFAULT 2;

-- Step 2: Backfill existing rows as generation 1 (old noisy pipeline)
UPDATE "competitors" SET "pipelineVersion" = 1 WHERE "pipelineVersion" = 2;

-- Step 3: Index for future generation-aware queries
CREATE INDEX IF NOT EXISTS "competitors_pipelineVersion_idx" ON "competitors"("pipelineVersion");

-- Step 4: Formally record the discoveries table structure that already exists
-- (added via prisma db push — this makes migrations the source of truth).
-- Using DO $$ block so this is idempotent if discoveries somehow doesn't exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'discoveries'
  ) THEN
    CREATE TABLE "discoveries" (
      "id" TEXT NOT NULL,
      "competitorId" TEXT NOT NULL,
      "queryId" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "discoveryMethod" TEXT NOT NULL,
      "originalValue" TEXT NOT NULL,
      "discoveredAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "discoveries_pkey" PRIMARY KEY ("id")
    );

    ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_competitorId_fkey"
      FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    CREATE INDEX "discoveries_competitorId_idx" ON "discoveries"("competitorId");
    CREATE INDEX "discoveries_queryId_idx" ON "discoveries"("queryId");
    CREATE INDEX "discoveries_source_idx" ON "discoveries"("source");
  END IF;

  -- Also add lastDiscoveredAt if it was added via db push and not yet in a migration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'competitors'
      AND column_name = 'lastDiscoveredAt'
  ) THEN
    ALTER TABLE "competitors" ADD COLUMN "lastDiscoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;
