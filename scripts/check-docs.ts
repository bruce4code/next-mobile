import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('📚 检查数据库中的文档...\n')

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' }
  })

  console.log(`找到 ${documents.length} 个文档:\n`)

  documents.forEach((doc, index) => {
    const hasEmbedding = doc.embedding !== null && doc.embedding !== undefined
    console.log(`${index + 1}. ${doc.title}`)
    console.log(`   分类: ${doc.category || '未分类'}`)
    console.log(`   有 Embedding: ${hasEmbedding ? '✅' : '❌'}`)
    console.log(`   创建时间: ${doc.createdAt.toISOString()}`)
    console.log('')
  })

  if (documents.length > 0) {
    console.log('📊 统计:')
    const docsWithEmbedding = documents.filter(d => d.embedding !== null && d.embedding !== undefined).length
    console.log(`  - 总文档数: ${documents.length}`)
    console.log(`  - 有 Embedding: ${docsWithEmbedding}`)
    console.log(`  - 无 Embedding: ${documents.length - docsWithEmbedding}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
