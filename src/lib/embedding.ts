import { createHash } from 'crypto'
import OpenAI from "openai"
import prisma from './prisma'
import { OPENROUTER_CONFIG, DEFAULT_EMBEDDING_MODEL } from './openrouter'

const openai = new OpenAI({
  apiKey: OPENROUTER_CONFIG.apiKey,
  baseURL: OPENROUTER_CONFIG.baseURL,
})

function hashText(text: string): string {
  return createHash('md5').update(text.replace(/\s+/g, '').slice(0, 500)).digest('hex')
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const modelToUse = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
  const textHash = hashText(text)

  // 1. 检查数据库缓存
  try {
    const rows = await prisma.$queryRaw<Array<{ embedding: string }>>`
      SELECT "embedding"::text as "embedding" FROM "EmbeddingCache"
      WHERE "textHash" = ${textHash} AND "model" = ${modelToUse}
      LIMIT 1
    `
    if (rows.length > 0) {
      console.log('🔁 命中 embedding 缓存, 文本哈希:', textHash)
      const raw = String(rows[0].embedding)
      const embedding = raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number)
      if (embedding.length === 1536 && embedding.every(n => !isNaN(n))) {
        return embedding
      }
      console.log('⚠️ 缓存数据异常，重新生成')
    }
  } catch (cacheError) {
    console.warn('⚠️ 查询 embedding 缓存失败，直接调用 API:', cacheError)
  }

  // 2. 调用 API 生成
  try {
    console.log('开始生成 embedding, 文本长度:', text.length)
    console.log('正在调用的 embedding 模型:', modelToUse)
    const response = await openai.embeddings.create({
      model: modelToUse,
      input: text,
      dimensions: 1536,
    })

    console.log('Embedding API 响应:', response)
    
    if (!response.data || response.data.length === 0) {
      throw new Error('Embedding API 返回空数据')
    }

    const embedding = response.data[0].embedding
    console.log('Embedding 生成成功, 维度:', embedding.length)
    console.log('Embedding 前10个值:', embedding.slice(0, 10))

    // 3. 存入数据库缓存
    try {
      const embeddingString = `[${embedding.join(',')}]`
      await prisma.$executeRaw`
        INSERT INTO "EmbeddingCache" ("id", "textHash", "text", "embedding", "model", "createdAt")
        VALUES (${crypto.randomUUID()}, ${textHash}, ${text.slice(0, 300)}, ${embeddingString}::vector, ${modelToUse}, NOW())
        ON CONFLICT ("textHash", "model") DO NOTHING
      `
      console.log('✅ embedding 已缓存')
    } catch (storeError) {
      console.warn('⚠️ 缓存 embedding 失败，不影响返回:', storeError)
    }

    return embedding
  } catch (error) {
    console.error('生成 embedding 失败:', error)
    throw error
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
      input: texts,
      dimensions: 1536,
    })

    if (!response.data || response.data.length === 0) {
      throw new Error('Embedding API 返回空数据')
    }

    return response.data.map((item) => item.embedding)
  } catch (error) {
    console.error('批量生成 embeddings 失败:', error)
    throw error
  }
}

