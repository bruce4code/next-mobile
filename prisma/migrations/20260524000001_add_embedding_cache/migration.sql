-- CreateTable: EmbeddingCache
CREATE TABLE "EmbeddingCache" (
    "id" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbeddingCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmbeddingCache_textHash_model_key" ON "EmbeddingCache"("textHash", "model");

-- CreateIndex
CREATE INDEX "EmbeddingCache_textHash_idx" ON "EmbeddingCache"("textHash");