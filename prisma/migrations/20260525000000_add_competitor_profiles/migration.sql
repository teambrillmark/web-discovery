-- Migration: add_competitor_profiles
--
-- WHY this table?
-- Profiling + ranking transforms a flat list of discovered competitors into
-- a ranked intelligence feed. We need to store:
--   1. The AI-extracted competitor profile (what this company is)
--   2. The deterministic relevance score (how similar to the target)
--   3. The scoring signals (why it scored that way — explainable)
--   4. The scoring reasoning (human-readable match explanation)
--
-- WHY not FK to competitors?
-- Profiling happens in the same request as discovery. Storing by (domain, queryId)
-- avoids a race condition and simplifies the pipeline — no need to look up a
-- competitorId before profiling can start.
--
-- WHY (domain, queryId) unique?
-- A competitor can be profiled multiple times across runs, but each run produces
-- a fresh score against the target's current context. The queryId scopes the profile
-- to a specific discovery run so we can track how scores evolve over time.

CREATE TABLE IF NOT EXISTS "competitor_profiles" (
  "id"                         TEXT             NOT NULL,
  "domain"                     TEXT             NOT NULL,
  "queryId"                    TEXT             NOT NULL,
  "companyType"                TEXT,
  "industry"                   TEXT,
  "niche"                      TEXT,
  "primaryCompetitiveIdentity" TEXT,
  "primarySpecialties"         JSONB            NOT NULL DEFAULT '[]',
  "coreServices"               JSONB            NOT NULL DEFAULT '[]',
  "targetAudience"             JSONB            NOT NULL DEFAULT '[]',
  "positioning"                TEXT,
  "aiConfidence"               TEXT             NOT NULL DEFAULT 'low',
  "relevanceScore"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "scoreConfidence"            TEXT             NOT NULL DEFAULT 'low',
  "matchedSignals"             JSONB            NOT NULL DEFAULT '{}',
  "scoringReasoning"           JSONB            NOT NULL DEFAULT '[]',
  "createdAt"                  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competitor_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "competitor_profiles_domain_queryId_key"
  ON "competitor_profiles"("domain", "queryId");

CREATE INDEX IF NOT EXISTS "competitor_profiles_domain_idx"
  ON "competitor_profiles"("domain");

CREATE INDEX IF NOT EXISTS "competitor_profiles_queryId_idx"
  ON "competitor_profiles"("queryId");

CREATE INDEX IF NOT EXISTS "competitor_profiles_relevanceScore_idx"
  ON "competitor_profiles"("relevanceScore");
