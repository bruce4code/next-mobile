import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/app/auth/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || undefined

    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const whereClause: any = {}
    if (category) {
      whereClause.category = category
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    })

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

    const result = await prisma.document.create({
      data: {
        title,
        content,
        contentType: contentType || 'text',
        category,
      },
    })

    console.log('文档创建成功:', result)
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
