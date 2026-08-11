import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 检测数据库索引状态...\n')

  // 检查 pgvector 和 pg_trgm 扩展
  console.log('=== PostgreSQL 扩展 ===')
  const extensions: Array<{ extname: string }> = await prisma.$queryRaw`
    SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm')
  `
  const extNames = extensions.map(e => e.extname)
  console.log(`  vector (pgvector): ${extNames.includes('vector') ? '✅ 已安装' : '❌ 未安装'}`)
  console.log(`  pg_trgm (模糊搜索): ${extNames.includes('pg_trgm') ? '✅ 已安装' : '❌ 未安装'}`)

  // 检查 DocumentChunk 表的索引
  console.log('\n=== DocumentChunk 索引 ===')
  const chunkIndexes: Array<{ indexname: string; indexdef: string }> = await prisma.$queryRaw`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'DocumentChunk'
    ORDER BY indexname
  `
  const chunkIdxMap = new Map(chunkIndexes.map(i => [i.indexname, i.indexdef]))
  
  const expectedChunkIndexes = [
    { name: 'DocumentChunk_pkey', label: '主键索引', type: 'btree' },
    { name: 'DocumentChunk_documentId_idx', label: 'documentId 外键', type: 'btree' },
    { name: 'DocumentChunk_embedding_idx', label: '向量搜索 (HNSW)', type: 'hnsw' },
    { name: 'DocumentChunk_title_trgm_idx', label: '关键词搜索 title (GIN trigram)', type: 'gin' },
    { name: 'DocumentChunk_content_trgm_idx', label: '关键词搜索 content (GIN trigram)', type: 'gin' },
  ]

  for (const idx of expectedChunkIndexes) {
    if (chunkIdxMap.has(idx.name)) {
      console.log(`  ${idx.label}: ✅ ${idx.type}`)
    } else {
      console.log(`  ${idx.label}: ❌ 未创建`)
    }
  }

  // 检查 Document 表的索引
  console.log('\n=== Document 索引 ===')
  const docIndexes: Array<{ indexname: string; indexdef: string }> = await prisma.$queryRaw`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'Document'
    ORDER BY indexname
  `
  const docIdxMap = new Map(docIndexes.map(i => [i.indexname, i.indexdef]))

  const expectedDocIndexes = [
    { name: 'Document_pkey', label: '主键索引', type: 'btree' },
    { name: 'Document_userId_idx', label: 'userId 查询', type: 'btree' },
    { name: 'Document_category_idx', label: 'category 过滤', type: 'btree' },
    { name: 'documents_embedding_hnsw_idx', label: '向量搜索 (HNSW)', type: 'hnsw' },
    { name: 'Document_title_trgm_idx', label: '降级搜索 title (GIN trigram)', type: 'gin' },
    { name: 'Document_content_trgm_idx', label: '降级搜索 content (GIN trigram)', type: 'gin' },
  ]

  for (const idx of expectedDocIndexes) {
    if (docIdxMap.has(idx.name)) {
      console.log(`  ${idx.label}: ✅ ${idx.type}`)
    } else {
      console.log(`  ${idx.label}: ❌ 未创建`)
    }
  }

  // 统计数据
  console.log('\n=== 数据统计 ===')
  const docCount: number = await prisma.document.count()
  const chunkCount: number = await prisma.documentChunk.count()
  const docsWithChunks: Array<{ count: number }> = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT "documentId")::int as count FROM "DocumentChunk"
  `

  console.log(`  Document 表: ${docCount} 条记录`)
  console.log(`  DocumentChunk 表: ${chunkCount} 条记录`)
  console.log(`  已分块的文档数: ${docsWithChunks[0]?.count ?? 0}`)

  // 总体诊断
  console.log('\n=== 诊断结论 ===')
  const missingIndexes = expectedChunkIndexes.filter(i => !chunkIdxMap.has(i.name))
    .concat(expectedDocIndexes.filter(i => !docIdxMap.has(i.name)))

  if (missingIndexes.length === 0 && chunkCount > 0) {
    console.log('✅ 所有索引已就绪，数据已分块，hybrid search 可以正常工作！')
  } else if (missingIndexes.length === 0 && chunkCount === 0) {
    console.log('⚠️ 索引齐全，但 DocumentChunk 为空。请上传文档后使用 hybrid search。')
  } else if (missingIndexes.length > 0) {
    console.log(`❌ 缺少 ${missingIndexes.length} 个索引，执行迁移：`)
    console.log('   npx prisma migrate deploy')
    console.log('   或手动执行:')
    for (const idx of missingIndexes) {
      console.log(`   - ${idx.label}`)
    }
  }
}

main()
  .catch((e) => {
    console.error('检测失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })