-- CreateEnum
CREATE TYPE "CompetitorStatus" AS ENUM ('DISCOVERED', 'VALIDATED_PASS', 'VALIDATED_FAIL');

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "status" "CompetitorStatus" NOT NULL DEFAULT 'DISCOVERED',
    "discoverySource" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitors_normalizedDomain_idx" ON "competitors"("normalizedDomain");

-- CreateIndex
CREATE INDEX "competitors_status_idx" ON "competitors"("status");
