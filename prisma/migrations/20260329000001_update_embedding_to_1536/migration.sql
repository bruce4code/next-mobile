-- 更新 embedding 列从 4096 维回到 1536 维
-- 注意：这会删除所有现有的 embedding 数据，需要重新生成

ALTER TABLE "Document" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "Document" ADD COLUMN "embedding" vector(1536);
