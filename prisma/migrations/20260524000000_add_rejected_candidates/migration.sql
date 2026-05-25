-- Migration: add_rejected_candidates
--
-- WHY this table?
-- Rejected candidates are intelligence, not garbage.
-- Storing them:
--   1. Prevents reprocessing known-bad domains on future runs (exclusion analogue)
--   2. Enables provider-quality analysis (which provider generates most noise?)
--   3. Preserves audit trail for qualification decisions
--
-- rejectionStage distinguishes cheap rule rejections from AI-validated ones,
-- so future logic can re-evaluate rule-rejected candidates with AI if needed.

CREATE TABLE IF NOT EXISTS "rejected_candidates" (
  "id"              TEXT        NOT NULL,
  "domain"          TEXT        NOT NULL,
  "queryId"         TEXT        NOT NULL,
  "rejectionReason" TEXT        NOT NULL,
  "rejectionStage"  TEXT        NOT NULL,
  "classification"  TEXT        NOT NULL,
  "relevance"       TEXT,
  "confidence"      DOUBLE PRECISION NOT NULL,
  "provider"        TEXT,
  "rejectedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rejected_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rejected_candidates_queryId_idx"
  ON "rejected_candidates"("queryId");

CREATE INDEX IF NOT EXISTS "rejected_candidates_domain_idx"
  ON "rejected_candidates"("domain");

CREATE INDEX IF NOT EXISTS "rejected_candidates_rejectionReason_idx"
  ON "rejected_candidates"("rejectionReason");
