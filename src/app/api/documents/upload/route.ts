import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/app/auth/server'
import prisma from '@/lib/prisma'
import { generateEmbedding } from '@/lib/embedding'

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const category = formData.get('category') as string || undefined

    if (files.length === 0) {
      return NextResponse.json({ error: '请上传至少一个文件' }, { status: 400 })
    }

    const mdFiles = files.filter(
      f => f.name.endsWith('.md') || f.name.endsWith('.markdown')
    )

    if (mdFiles.length === 0) {
      return NextResponse.json(
        { error: '仅支持 .md 和 .markdown 文件' },
        { status: 400 }
      )
    }

    const results: Array<{
      file: string
      title: string
      status: 'success' | 'failed'
      id?: string
      reason?: string
    }> = []

    for (const file of mdFiles) {
      try {
        const content = await file.text()
        const title = file.name.replace(/\.(md|markdown)$/i, '')

        console.log(`上传文件: ${file.name}, 内容长度: ${content.length}`)

        const docId = crypto.randomUUID()
        const now = new Date()

        let embedding: number[] | null = null
        try {
          console.log(`生成 embedding: ${file.name}`)
          embedding = await generateEmbedding(content)
          console.log(`Embedding 生成成功: ${embedding.length} 维`)
        } catch (embeddingError) {
          console.warn(`生成 embedding 失败 (${file.name}):`, embeddingError)
        }

        if (embedding) {
          const embeddingString = `[${embedding.join(',')}]`
          await prisma.$executeRaw`
            INSERT INTO "Document" (
              "id", "title", "content", "contentType", "category",
              "userId", "embedding", "createdAt", "updatedAt"
            ) VALUES (
              ${docId}, ${title}, ${content}, 'markdown', ${category},
              ${user.id}, ${embeddingString}::vector, ${now}, ${now}
            )
          `
        } else {
          await prisma.$executeRaw`
            INSERT INTO "Document" (
              "id", "title", "content", "contentType", "category",
              "userId", "createdAt", "updatedAt"
            ) VALUES (
              ${docId}, ${title}, ${content}, 'markdown', ${category},
              ${user.id}, ${now}, ${now}
            )
          `
        }

        results.push({
          file: file.name,
          title,
          status: 'success',
          id: docId,
        })

        console.log(`文档创建成功: ${title} (${docId})`)
      } catch (fileError) {
        console.error(`处理文件 ${file.name} 失败:`, fileError)
        results.push({
          file: file.name,
          title: file.name,
          status: 'failed',
          reason: String(fileError),
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    console.log(`上传完成: ${successCount}/${mdFiles.length} 个文件`)

    return NextResponse.json({
      results,
      successCount,
      totalCount: mdFiles.length,
    })
  } catch (error) {
    console.error('文件上传失败:', error)
    return NextResponse.json(
      { error: '文件上传失败', details: String(error) },
      { status: 500 }
    )
  }
}