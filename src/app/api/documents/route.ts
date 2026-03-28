import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/app/auth/server'
import prisma from '@/lib/prisma'
import { generateEmbedding } from '@/lib/embedding'

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
        console.log('执行向量搜索, 查询:', search)
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
        
        console.log('向量搜索结果数量:', results.length)
        return NextResponse.json(results)
      } catch (searchError) {
        console.warn('向量搜索失败，回退到文本搜索:', searchError)
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

    console.log('获取文档数量:', documents.length)
    return NextResponse.json(documents)
  } catch (error) {
    console.error('获取文档失败:', error)
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
    console.log('接收到的请求体:', body)

    const { title, content, contentType, category } = body
    const docId = crypto.randomUUID()
    const now = new Date()

    let embedding: number[] | null = null
    try {
      console.log('开始生成 embedding...')
      embedding = await generateEmbedding(content)
      console.log('Embedding 生成成功, 长度:', embedding.length)
    } catch (embeddingError) {
      console.warn('生成 embedding 失败，将不保存 embedding:', embeddingError)
    }

    if (embedding) {
      const embeddingString = `[${embedding.join(',')}]`
      await prisma.$executeRaw`
        INSERT INTO "Document" (
          "id", "title", "content", "contentType", "category", 
          "userId", "embedding", "createdAt", "updatedAt"
        ) VALUES (
          ${docId}, ${title}, ${content}, ${contentType || 'text'}, ${category},
          ${user.id}, ${embeddingString}::vector, ${now}, ${now}
        )
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO "Document" (
          "id", "title", "content", "contentType", "category", 
          "userId", "createdAt", "updatedAt"
        ) VALUES (
          ${docId}, ${title}, ${content}, ${contentType || 'text'}, ${category},
          ${user.id}, ${now}, ${now}
        )
      `
    }

    const result = await prisma.document.findUnique({
      where: { id: docId }
    })

    console.log('文档创建成功:', result?.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error('添加文档失败:', error)
    return NextResponse.json({ error: '添加文档失败', details: String(error) }, { status: 500 })
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

    await prisma.document.delete({
      where: {
        id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除文档失败:', error)
    return NextResponse.json({ error: '删除文档失败' }, { status: 500 })
  }
}
