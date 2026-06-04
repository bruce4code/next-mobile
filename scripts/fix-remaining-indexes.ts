/**
 * 补跑剩余 3 个缺失的索引（DO $$ 块 Prisma 不支持）
 *
 * 使用方式:
 *   npx tsx scripts/fix-remaining-indexes.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const sqlList = [
  // 1. Document HNSW 索引
  `CREATE INDEX IF NOT EXISTS "documents_embedding_hnsw_idx"
   ON "Document"
   USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64)`,

  // 2. Document title trigram 索引
  `CREATE INDEX IF NOT EXISTS "Document_title_trgm_idx"
   ON "Document"
   USING gin (title gin_trgm_ops)`,

  // 3. DocumentChunk title trigram 索引
  `CREATE INDEX IF NOT EXISTS "DocumentChunk_title_trgm_idx"
   ON "DocumentChunk"
   USING gin (title gin_trgm_ops)`,
]

async function main() {
  console.log('补跑剩余索引...\n')

  for (const sql of sqlList) {
    try {
      await prisma.$executeRawUnsafe(sql)
      console.log(`  ✅ ${sql.split('\n')[0].trim()}`)
    } catch (error) {
      console.log(`  ❌ ${String(error).substring(0, 100)}`)
    }
  }

  // 验证
  console.log('\n最终索引状态验证:\n')
  const indexes: Array<{ tablename: string; indexname: string }> = await prisma.$queryRaw`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE tablename IN ('Document', 'DocumentChunk')
    AND indexname LIKE '%hnsw%' OR indexname LIKE '%trgm%'
    ORDER BY tablename, indexname
  `
  for (const idx of indexes) {
    console.log(`  ${idx.tablename}: ${idx.indexname}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())