CREATE TYPE "DocumentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "IngestionJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'RETRY', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "IngestionOperation" AS ENUM ('INDEX', 'REINDEX');

ALTER TABLE "Document"
ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'inline',
ADD COLUMN "sourceName" TEXT,
ADD COLUMN "sourceUri" TEXT,
ADD COLUMN "sourceChecksum" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "parserVersion" TEXT,
ADD COLUMN "chunkingVersion" TEXT,
ADD COLUMN "embeddingModel" TEXT,
ADD COLUMN "lastIndexedAt" TIMESTAMP(3),
ADD COLUMN "ingestionError" TEXT;

ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

ALTER TABLE "DocumentChunk"
ADD COLUMN "heading" TEXT,
ADD COLUMN "startOffset" INTEGER,
ADD COLUMN "endOffset" INTEGER,
ADD COLUMN "sourceVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "metadata" JSONB;

CREATE TABLE "IngestionJob" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "documentVersion" INTEGER NOT NULL,
  "operation" "IngestionOperation" NOT NULL DEFAULT 'INDEX',
  "status" "IngestionJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "idempotencyKey" TEXT NOT NULL,
  "error" TEXT,
  "lockedAt" TIMESTAMP(3),
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_userId_status_idx" ON "Document"("userId", "status");
CREATE INDEX "DocumentChunk_documentId_sourceVersion_idx" ON "DocumentChunk"("documentId", "sourceVersion");
CREATE UNIQUE INDEX "IngestionJob_userId_idempotencyKey_key" ON "IngestionJob"("userId", "idempotencyKey");
CREATE INDEX "IngestionJob_status_availableAt_idx" ON "IngestionJob"("status", "availableAt");
CREATE INDEX "IngestionJob_documentId_documentVersion_idx" ON "IngestionJob"("documentId", "documentVersion");
CREATE INDEX "IngestionJob_userId_createdAt_idx" ON "IngestionJob"("userId", "createdAt");

ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
