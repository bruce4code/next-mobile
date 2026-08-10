import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })
config({ path: path.resolve(process.cwd(), '.env') })

const prisma = new PrismaClient()

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
})

const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small'

async function generateEmbedding(text: string): Promise<number[]> {
  console.log(`  生成 embedding...`)
  const response = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    input: text,
    dimensions: 1536,
  })

  return response.data[0].embedding
}

async function main() {
  console.log('🚀 开始为文档生成 embeddings...\n')

  const documents = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' }
  })

  console.log(`找到 ${documents.length} 个文档\n`)

  let successCount = 0
  let failCount = 0

  for (const doc of documents) {
    console.log(`处理文档: ${doc.title}`)
    
    try {
      const embedding = await generateEmbedding(doc.content)
      console.log(`  ✅ Embedding 生成成功 (${embedding.length} 维)`)

      await prisma.$executeRaw`
        UPDATE "Document"
        SET embedding = ${embedding}::vector,
            "updatedAt" = NOW()
        WHERE id = ${doc.id}
      `
      
      console.log(`  ✅ 文档已更新\n`)
      successCount++
    } catch (error) {
      console.error(`  ❌ 失败:`, error)
      failCount++
      console.log('')
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log('\n📊 完成统计:')
  console.log(`  成功: ${successCount}`)
  console.log(`  失败: ${failCount}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
