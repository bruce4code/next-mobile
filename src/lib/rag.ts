import { Prisma } from '@prisma/client'
import prisma from './prisma'
import { generateEmbedding } from './embedding'

interface SearchOptions {
  topK?: number
  category?: string
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
    const { topK = 5, category } = options

    console.log('RAG 搜索开始, 查询:', query)
    
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
        LIMIT ${topK}
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
        LIMIT ${topK}
      `
    }

    console.log('RAG 搜索结果数量:', (results as any[]).length)
    return results as DocumentResult[]
  } catch (error) {
    console.error('RAG 搜索失败，尝试文本搜索:', error)
    return await searchByText(query, options)
  }
}

async function searchByText(query: string, options: SearchOptions = {}): Promise<DocumentResult[]> {
  try {
    const { topK = 5, category } = options
    console.log('执行文本搜索, 查询:', query)

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

    console.log('文本搜索结果数量:', results.length)
    return results.map(doc => ({
      ...doc,
      similarity: 0.5,
    })) as DocumentResult[]
  } catch (textError) {
    console.error('文本搜索也失败了:', textError)
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
      let docInfo = `[文档 ${index + 1}: ${doc.title}]`
      if (doc.similarity !== undefined) {
        docInfo += ` (相似度: ${(doc.similarity * 100).toFixed(1)}%)`
      }
      return `${docInfo}\n${doc.content}`
    })
    .join('\n\n')

  return `【重要指令】你必须优先使用以下知识库中的信息来回答用户的问题！

【知识库参考资料】
${context}

【强制回答规则】
1. 🔴 必须首先尝试使用知识库中的信息回答
2. 🟢 如果知识库中有相关内容，必须基于知识库内容回答
3. 🟡 只有当知识库中完全没有相关信息时，才使用你自己的知识
4. 📝 回答要明确引用知识库中的内容
5. ✅ 保持回答准确、简洁、有帮助

【用户的问题】请基于以上知识库回答：`
}
