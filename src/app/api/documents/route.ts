import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/app/auth/server'
import prisma from '@/lib/prisma'
import { generateEmbedding } from '@/lib/embedding'
import { enqueueDocumentIngestion, enqueueDocumentReindex } from '@/lib/ingestion'
import { archiveDocumentSource, deleteDocumentSources } from '@/lib/sourceStorage'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

interface DocumentSearchResult {
  id: string
  title: string
  content: string
  contentType: string
  category: string | null
  metadata: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
  similarity: number
}

const CreateDocumentSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(500),
  content: z.string().trim().min(1, '内容不能为空').max(1_000_000),
  contentType: z.enum(['text', 'markdown']).optional().default('text'),
  category: z.string().trim().max(100).optional(),
  sourceType: z.enum(['inline', 'upload', 'import']).optional().default('inline'),
  sourceName: z.string().trim().max(500).optional(),
})

const UpdateDocumentSchema = CreateDocumentSchema.omit({ sourceType: true, sourceName: true }).partial().extend({
  category: z.string().trim().max(100).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, '至少需要提供一个更新字段')

const DocumentQuerySchema = z.object({
  category: z.string().trim().max(100).optional(),
  search: z.string().trim().min(1).max(500).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const parsedQuery = DocumentQuerySchema.safeParse({
      category: searchParams.get('category') || undefined,
      search: searchParams.get('search') || undefined,
    })
    if (!parsedQuery.success) {
      return NextResponse.json({ error: '请求参数校验失败', details: parsedQuery.error.issues }, { status: 400 })
    }
    const { category, search } = parsedQuery.data

    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    if (search) {
      try {
        logger.info('Documents.Search', { query: search, category: category || 'all' })
        const queryEmbedding = await generateEmbedding(search)
        const queryEmbeddingString = `[${queryEmbedding.join(',')}]`
        
        let results: DocumentSearchResult[]
        if (category) {
          results = await prisma.$queryRaw<DocumentSearchResult[]>`
            SELECT 
              id,
              title,
              content,
              "contentType",
              category,
              metadata,
              "createdAt",
              "updatedAt",
              1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
            FROM "Document"
            WHERE embedding IS NOT NULL
            AND category = ${category}
            AND "userId" = ${user.id}
            AND "status" = 'READY'::"DocumentStatus"
            ORDER BY embedding <=> ${queryEmbeddingString}::vector
            LIMIT 10
          `
        } else {
          results = await prisma.$queryRaw<DocumentSearchResult[]>`
            SELECT 
              id,
              title,
              content,
              "contentType",
              category,
              metadata,
              "createdAt",
              "updatedAt",
              1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
            FROM "Document"
            WHERE embedding IS NOT NULL
            AND "userId" = ${user.id}
            AND "status" = 'READY'::"DocumentStatus"
            ORDER BY embedding <=> ${queryEmbeddingString}::vector
            LIMIT 10
          `
        }
        
        logger.info('Documents.Search.Result', { count: results.length })
        return NextResponse.json(results)
      } catch (searchError) {
        logger.warn('Documents.Search.Fallback', { error: String(searchError) })
      }
    }

    const whereClause: Prisma.DocumentWhereInput = { userId: user.id }
    if (category) {
      whereClause.category = category
    }
    if (search) {
      whereClause.status = 'READY'
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ]
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    })

    logger.info('Documents.List', { count: documents.length })
    return NextResponse.json(documents, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    })
  } catch (error) {
    logger.error('Documents.Get.Error', { error: String(error) })
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await req.json()

    const parsed = CreateDocumentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '请求参数校验失败', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.slice(0, 200) || crypto.randomUUID()
    const result = await enqueueDocumentIngestion({
      userId: user.id,
      ...parsed.data,
      idempotencyKey,
    })

    let responseDocument = result.document
    try {
      const sourceUri = await archiveDocumentSource({
        userId: user.id,
        documentId: result.document.id,
        version: result.document.version,
        content: result.document.content,
        contentType: result.document.contentType,
      })
      if (sourceUri) {
        responseDocument = await prisma.document.update({
          where: { id: result.document.id },
          data: { sourceUri },
        })
      }
    } catch (storageError) {
      logger.warn('Documents.SourceArchive.Failed', {
        documentId: result.document.id,
        error: String(storageError),
      })
    }

    logger.info('Documents.Create.Queued', {
      documentId: result.document.id,
      jobId: result.job.id,
      deduplicated: result.deduplicated,
    })

    return NextResponse.json({
      document: responseDocument,
      job: result.job,
      deduplicated: result.deduplicated,
    }, { status: 202 })
  } catch (error) {
    logger.error('Documents.Create.Error', { error: String(error) })
    return NextResponse.json({ error: '添加文档失败', details: String(error) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少文档 ID' }, { status: 400 })
    }

    const body = await req.json()
    const parsed = UpdateDocumentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: '请求参数校验失败', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { title, content, contentType, category } = parsed.data

    // 读取当前文档，确认存在
    const existing = await prisma.document.findFirst({ where: { id, userId: user.id } })
    if (!existing) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 })
    }

    const newTitle = title ?? existing.title
    const newContent = content ?? existing.content
    const newContentType = contentType ?? existing.contentType
    const newCategory = category !== undefined ? category : existing.category

    const result = await enqueueDocumentReindex({
      documentId: id,
      userId: user.id,
      title: newTitle,
      content: newContent,
      contentType: newContentType,
      category: newCategory,
      idempotencyKey: req.headers.get('idempotency-key')?.slice(0, 200) || crypto.randomUUID(),
    })
    if (!result) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 })
    }

    try {
      const sourceUri = await archiveDocumentSource({
        userId: user.id,
        documentId: result.document.id,
        version: result.document.version,
        content: result.document.content,
        contentType: result.document.contentType,
      })
      if (sourceUri) {
        result.document = await prisma.document.update({
          where: { id: result.document.id },
          data: { sourceUri },
        })
      }
    } catch (storageError) {
      logger.warn('Documents.SourceArchive.Failed', {
        documentId: result.document.id,
        error: String(storageError),
      })
    }

    logger.info('Documents.Edit.Queued', { documentId: result.document.id, jobId: result.job.id })
    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    logger.error('Documents.Edit.Error', { error: String(error) })
    return NextResponse.json({ error: '编辑文档失败', details: String(error) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少文档 ID' }, { status: 400 })
    }

    const deleted = await prisma.document.deleteMany({ where: { id, userId: user.id } })
    if (deleted.count === 0) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 })
    }

    try {
      await deleteDocumentSources(user.id, id)
    } catch (storageError) {
      logger.warn('Documents.SourceArchive.DeleteFailed', { documentId: id, error: String(storageError) })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Documents.Delete.Error', { error: String(error) })
    return NextResponse.json({ error: '删除文档失败' }, { status: 500 })
  }
}
