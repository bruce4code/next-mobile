-- =========================================================
-- 一站式修复：执行所有缺失的迁移 SQL
-- 适用于：迁移被注册但 applied_steps_count = 0 的情况
-- 所有语句都带 IF NOT EXISTS，可安全重复执行
-- =========================================================

-- 1. 启用扩展（已启用则跳过）
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================================
-- 2. Document 表 — 已在旧流程创建，仅补充 HNSW 索引
-- =========================================================

-- 确保 embedding 列有正确的维度（当前使用的模型输出 1536 维）
-- 如果列不存在则创建
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Document' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE "Document" ADD COLUMN "embedding" vector(1536);
  END IF;
END $$;

-- HNSW 索引（向量搜索加速）
CREATE INDEX IF NOT EXISTS "documents_embedding_hnsw_idx"
ON "Document"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- GIN trigram 索引（降级 ILIKE 搜索加速）
CREATE INDEX IF NOT EXISTS "Document_title_trgm_idx"
ON "Document"
USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Document_content_trgm_idx"
ON "Document"
USING gin (content gin_trgm_ops);

-- =========================================================
-- 3. EmbeddingCache 表
-- =========================================================

CREATE TABLE IF NOT EXISTS "EmbeddingCache" (
    "id" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmbeddingCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmbeddingCache_textHash_model_key"
ON "EmbeddingCache"("textHash", "model");

CREATE INDEX IF NOT EXISTS "EmbeddingCache_textHash_idx"
ON "EmbeddingCache"("textHash");

-- =========================================================
-- 4. DocumentChunk 表
-- =========================================================

CREATE TABLE IF NOT EXISTS "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- 外键（如果已存在则跳过）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'DocumentChunk_documentId_fkey'
  ) THEN
    ALTER TABLE "DocumentChunk"
    ADD CONSTRAINT "DocumentChunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- B-tree 索引（JoIn 加速）
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx"
ON "DocumentChunk"("documentId");

-- HNSW 索引（向量搜索加速）
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
ON "DocumentChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- GIN trigram 索引（关键词搜索加速）
CREATE INDEX IF NOT EXISTS "DocumentChunk_title_trgm_idx"
ON "DocumentChunk"
USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "DocumentChunk_content_trgm_idx"
ON "DocumentChunk"
USING gin (content gin_trgm_ops);

-- =========================================================
-- 5. 更新 _prisma_migrations 标记完成
-- =========================================================

-- 将所有空跑（applied_steps_count = 0）的迁移标记为成功
UPDATE _prisma_migrations
SET applied_steps_count = 1, logs = 'manually applied via fix-script'
WHERE applied_steps_count = 0;

-- =========================================================
-- 完成
-- =========================================================

-- 验证：检查所有索引是否就绪
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('Document', 'DocumentChunk', 'EmbeddingCache')
ORDER BY tablename, indexname;