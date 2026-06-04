import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/app/auth/server'
import prisma from '@/lib/prisma'
import { generateEmbedding, generateEmbeddings } from '@/lib/embedding'
import { chunkDocument } from '@/lib/chunking'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const CreateDocumentSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  content: z.string().min(1, '内容不能为空'),
  contentType: z.enum(['text', 'markdown']).optional().default('text'),
  category: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || undefined
    const search = searchParams.get('search') || undefined

    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    if (search) {
      try {
        logger.info('Documents.Search', { query: search, category: category || 'all' })
        const queryEmbedding = await generateEmbedding(search)
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
              "updatedAt",
              1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
            FROM "Document"
            WHERE embedding IS NOT NULL
            AND category = ${category}
            ORDER BY embedding <=> ${queryEmbeddingString}::vector
            LIMIT 10
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
              "updatedAt",
              1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
            FROM "Document"
            WHERE embedding IS NOT NULL
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

    const whereClause: any = {}
    if (category) {
      whereClause.category = category
    }
    if (search) {
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

    const { title, content, contentType, category } = parsed.data
    const docId = crypto.randomUUID()
    const now = new Date()

    let embedding: number[] | null = null
    try {
      logger.info('Documents.Embedding.Start', { title, docId })
      embedding = await generateEmbedding(content)
      logger.info('Documents.Embedding.Success', { docId, length: embedding.length })
    } catch (embeddingError) {
      logger.warn('Documents.Embedding.Failed', { docId, error: String(embeddingError) })
    }

    if (embedding) {
      const embeddingString = `[${embedding.join(',')}]`
      await prisma.$executeRaw`
        INSERT INTO "Document" (
          "id", "title", "content", "contentType", "category", 
          "userId", "embedding", "createdAt", "updatedAt"
        ) VALUES (
          ${docId}, ${title}, ${content}, ${contentType}, ${category},
          ${user.id}, ${embeddingString}::vector, ${now}, ${now}
        )
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO "Document" (
          "id", "title", "content", "contentType", "category", 
          "userId", "createdAt", "updatedAt"
        ) VALUES (
          ${docId}, ${title}, ${content}, ${contentType}, ${category},
          ${user.id}, ${now}, ${now}
        )
      `
    }

    const result = await prisma.document.findUnique({
      where: { id: docId }
    })

    logger.info('Documents.Create.Success', { docId: result?.id })

    // 自动分块并生成每个块的 embedding
    try {
      const chunks = await chunkDocument(title, content, contentType)
      logger.info('Documents.Chunk.Start', { title, chunkCount: chunks.length })
      try {
        const chunkTexts = chunks.map(chunk => chunk.title + '\n' + chunk.content)
        const chunkEmbeddings = await generateEmbeddings(chunkTexts)
        await Promise.all(chunks.map((chunk, i) => {
          const embeddingString = `[${chunkEmbeddings[i].join(',')}]`
          return prisma.$executeRaw`
            INSERT INTO "DocumentChunk" ("id", "documentId", "title", "content", "chunkIndex", "embedding", "createdAt")
            VALUES (${crypto.randomUUID()}, ${docId}, ${chunk.title}, ${chunk.content}, ${chunk.index}, ${embeddingString}::vector, NOW())
          `
        }))
      } catch (chunkError) {
        logger.warn('Documents.Chunk.Embedding.Failed', { title, docId, error: String(chunkError) })
      }
      logger.info('Documents.Chunk.Success', { title, chunkCount: chunks.length })
    } catch (chunkError) {
      logger.warn('Documents.Chunk.Failed', { title, docId, error: String(chunkError) })
    }

    return NextResponse.json(result)
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
    const parsed = z.object({
      title: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      contentType: z.enum(['text', 'markdown']).optional(),
      category: z.string().nullable().optional(),
    }).safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: '请求参数校验失败', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { title, content, contentType, category } = parsed.data

    // 读取当前文档，确认存在
    const existing = await prisma.document.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 })
    }

    const newTitle = title ?? existing.title
    const newContent = content ?? existing.content
    const newContentType = contentType ?? existing.contentType
    const newCategory = category !== undefined ? category : existing.category

    // 1. 更新 Document（嵌入生成是外部 API 调用，无法放入事务）
    let embedding: number[] | null = null
    try {
      embedding = await generateEmbedding(newContent)
    } catch (embedErr) {
      logger.warn('Documents.Edit.Embedding.Failed', { id, error: String(embedErr) })
    }

    const embeddingString = embedding ? `[${embedding.join(',')}]` : null
    const now = new Date()

    // 先更新 Document 行（简单操作，失败概率低）
    if (embeddingString) {
      await prisma.$executeRaw`
        UPDATE "Document" SET
          "title" = ${newTitle},
          "content" = ${newContent},
          "contentType" = ${newContentType},
          "category" = ${newCategory},
          "embedding" = ${embeddingString}::vector,
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `
    } else {
      // embedding 生成失败：更新但不更新向量
      await prisma.$executeRaw`
        UPDATE "Document" SET
          "title" = ${newTitle},
          "content" = ${newContent},
          "contentType" = ${newContentType},
          "category" = ${newCategory},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `
    }

    // 2. 重新分块
    try {
      const chunks = await chunkDocument(newTitle, newContent, newContentType)
      logger.info('Documents.Edit.Chunk.Start', { title: newTitle, chunkCount: chunks.length })

      const chunkTexts = chunks.map(chunk => chunk.title + '\n' + chunk.content)
      const chunkEmbeddings = await generateEmbeddings(chunkTexts)

      // 3. 事务包裹：删除旧 chunk + 插入新 chunk
      await prisma.$transaction(async (tx) => {
        // 先删旧的
        await tx.$executeRaw`
          DELETE FROM "DocumentChunk" WHERE "documentId" = ${id}
        `

        // 再插新的
        for (let i = 0; i < chunks.length; i++) {
          const vec = `[${chunkEmbeddings[i].join(',')}]`
          await tx.$executeRaw`
            INSERT INTO "DocumentChunk" ("id", "documentId", "title", "content", "chunkIndex", "embedding", "createdAt")
            VALUES (${crypto.randomUUID()}, ${id}, ${chunks[i].title}, ${chunks[i].content}, ${chunks[i].index}, ${vec}::vector, NOW())
          `
        }
      })

      logger.info('Documents.Edit.Success', { id, title: newTitle })
    } catch (chunkError) {
      logger.warn('Documents.Edit.Chunk.Failed', { id, title: newTitle, error: String(chunkError) })
    }

    const result = await prisma.document.findUnique({ where: { id } })
    return NextResponse.json(result)
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

    // 事务包裹：级联删除 DocumentChunk
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "DocumentChunk" WHERE "documentId" = ${id}`
      await tx.$executeRaw`DELETE FROM "Document" WHERE "id" = ${id}`
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Documents.Delete.Error', { error: String(error) })
    return NextResponse.json({ error: '删除文档失败' }, { status: 500 })
  }
}
