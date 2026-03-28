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
  const { topK = 5, category } = options

  const queryEmbedding = await generateEmbedding(query)

  const results = await prisma.$queryRaw`
    SELECT 
      id,
      title,
      content,
      "contentType",
      category,
      metadata,
      "createdAt",
      1 - (embedding <=> ${queryEmbedding}::vector) as similarity
    FROM "Document"
    ${category ? prisma.$queryRaw`WHERE category = ${category}` : prisma.$queryRaw``}
    ORDER BY embedding <=> ${queryEmbedding}::vector
    LIMIT ${topK}
  `

  return results as DocumentResult[]
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

export function buildRAGContext(documents: Array<{ title: string; content: string }>) {
  if (documents.length === 0) {
    return ''
  }

  const context = documents
    .map((doc, index) => `[Document ${index + 1}: ${doc.title}]\n${doc.content}`)
    .join('\n\n')

  return `以下是相关的参考资料，请基于这些资料回答用户的问题：\n\n${context}\n\n`
}
