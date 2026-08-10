CREATE TABLE "RagShadowComparison" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "queryHash" TEXT NOT NULL,
  "legacyDocumentIds" JSONB NOT NULL,
  "nestDocumentIds" JSONB NOT NULL,
  "legacyCount" INTEGER NOT NULL,
  "nestCount" INTEGER NOT NULL,
  "overlap" INTEGER NOT NULL,
  "latencyMs" INTEGER,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RagShadowComparison_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RagShadowComparison_createdAt_idx" ON "RagShadowComparison"("createdAt");
CREATE INDEX "RagShadowComparison_userId_createdAt_idx" ON "RagShadowComparison"("userId", "createdAt");
