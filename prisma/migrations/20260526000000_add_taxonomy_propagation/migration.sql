-- AddColumn: businessModel (nullable, authoritative normalized taxonomy)
-- AddColumn: businessModelConfidence (JSON, confidence distribution per BusinessModel)
-- These columns persist the output of classifyCompanyTaxonomy() so downstream
-- layers (API, UI, analytics) consume the same classification without recomputing.

ALTER TABLE "competitor_profiles" ADD COLUMN "businessModel" TEXT;
ALTER TABLE "competitor_profiles" ADD COLUMN "businessModelConfidence" JSONB NOT NULL DEFAULT '{}';
