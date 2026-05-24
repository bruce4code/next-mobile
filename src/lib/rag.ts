import { Prisma } from '@prisma/client'
import prisma from './prisma'
import { generateEmbedding } from './embedding'

// 相似度阈值：低于此值的文档视为不相关，不纳入上下文
const DEFAULT_MIN_SIMILARITY = 0.5
// 向量搜索的粗召回数量（比最终需要的多，给阈值过滤留余量）
const VECTOR_RECALL_MULTIPLIER = 3

interface SearchOptions {
  topK?: number
  category?: string
  minSimilarity?: number
}

interface DocumentResult {
  id: string
  title: string
  content: string
  contentType: string
  category?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  similarity: number
}

interface DocumentInput {
  title: string
  content: string
  contentType?: string
  category?: string
  metadata?: Record<string, unknown>
  userId?: string
}

export async function searchSimilarDocuments(
  query: string,
  options: SearchOptions = {}
): Promise<DocumentResult[]> {
  try {
    const { topK = 5, category, minSimilarity = DEFAULT_MIN_SIMILARITY } = options

    // 粗召回：多拉一些文档，给阈值过滤留空间
    const recallCount = topK * VECTOR_RECALL_MULTIPLIER

    console.log('RAG 搜索开始, 查询:', query)
    console.log(`  粗召回: ${recallCount} 条, 阈值: ${(minSimilarity * 100).toFixed(0)}%`)

    let queryEmbedding: number[]
    try {
      queryEmbedding = await generateEmbedding(query)
    } catch (embeddingError) {
      console.warn('⚠️ 无法生成查询 embedding，尝试文本搜索:', embeddingError)
      return await searchByText(query, options)
    }

    const queryEmbeddingString = `[${queryEmbedding.join(',')}]`
    let results: any[]
    if (category) {
      results = await prisma.$queryRaw`
        SELECT 
          id,
          title,
          content,
          "contentType",
          category,
          metadata,
          "createdAt",
          1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
        FROM "Document"
        WHERE embedding IS NOT NULL
        AND category = ${category}
        ORDER BY embedding <=> ${queryEmbeddingString}::vector
        LIMIT ${recallCount}
      `
    } else {
      results = await prisma.$queryRaw`
        SELECT 
          id,
          title,
          content,
          "contentType",
          category,
          metadata,
          "createdAt",
          1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
        FROM "Document"
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${queryEmbeddingString}::vector
        LIMIT ${recallCount}
      `
    }

    console.log(`  粗召回结果: ${(results as any[]).length} 条`)

    const filtered = (results as DocumentResult[]).filter(
      (r) => r.similarity >= minSimilarity
    )

    if (filtered.length < results.length) {
      console.log(
        `  阈值过滤: 剔除 ${results.length - filtered.length} 条低相关文档`
      )
    }

    const finalResults = filtered.slice(0, topK)
    console.log(`  最终返回: ${finalResults.length} 条`)

    if (finalResults.length === 0) {
      console.log('  ⚠️ 所有文档相似度均低于阈值，尝试文本搜索降级')
      return await searchByText(query, options)
    }

    return finalResults
  } catch (error) {
    console.error('RAG 搜索失败，尝试文本搜索:', error)
    return await searchByText(query, options)
  }
}

async function searchByText(query: string, options: SearchOptions = {}): Promise<DocumentResult[]> {
  try {
    const { topK = 5, category } = options
    console.log('  执行文本搜索降级, 查询:', query)

    const whereClause: any = {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ],
    }

    if (category) {
      whereClause.category = category
    }

    const results = await prisma.document.findMany({
      where: whereClause,
      take: topK,
      orderBy: { createdAt: 'desc' },
    })

    console.log('  文本搜索结果数量:', results.length)
    return results.map(doc => ({
      ...doc,
      similarity: 0.5,
    })) as DocumentResult[]
  } catch (textError) {
    console.error('  文本搜索也失败了:', textError)
    return []
  }
}

export async function addDocument(
  title: string,
  content: string,
  options: Omit<DocumentInput, 'title' | 'content'> = {}
) {
  const { contentType = 'text', category, metadata, userId } = options
  const embedding = await generateEmbedding(content)

  return await prisma.document.create({
    data: {
      title,
      content,
      contentType,
      category,
      metadata,
      userId,
      embedding: embedding as unknown as Prisma.JsonValue,
    },
  })
}

export async function addDocuments(
  documents: DocumentInput[]
) {
  const results: Awaited<ReturnType<typeof addDocument>>[] = []

  for (const doc of documents) {
    const result = await addDocument(
      doc.title,
      doc.content,
      {
        contentType: doc.contentType,
        category: doc.category,
        metadata: doc.metadata,
        userId: doc.userId,
      }
    )
    results.push(result)
  }

  return results
}

export function buildRAGContext(documents: Array<{ title: string; content: string; similarity?: number }>) {
  if (documents.length === 0) {
    return ''
  }

  const context = documents
    .map((doc, index) => {
      const relevance = doc.similarity !== undefined
        ? ` (相关度: ${(doc.similarity * 100).toFixed(0)}%)`
        : ''
      return `[文档${index + 1}] ${doc.title}${relevance}\n${doc.content}`
    })
    .join('\n\n---\n\n')

  return `你是电商AI助手，请严格基于以下知识库文档回答用户问题。

## 知识库文档
${context}

## 回答要求
1. 必须注明引用来源，格式：[来源：文档名]
2. 如果所有文档都与用户问题无关，回复"知识库中暂无相关信息，请补充相关文档后再试"
3. 回答简洁准确，不编造文档中没有的内容`
}