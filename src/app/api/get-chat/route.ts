import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const conversationId = searchParams.get('conversationId')
    const cursorCreatedAt = searchParams.get('cursorCreatedAt')
    const limit = Math.min(
      parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE)),
      MAX_PAGE_SIZE
    )

    if (!userId && !conversationId) {
      return NextResponse.json({ error: '缺少 userId 或 conversationId 参数' }, { status: 400 })
    }

    if (conversationId) {
      const where: Record<string, unknown> = { conversationId }
      if (userId) where.userId = userId

      if (cursorCreatedAt) {
        where.createdAt = { lt: new Date(cursorCreatedAt) }
      }

      const messages = await prisma.openRouterChat.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
      })

      const hasMore = messages.length > limit
      if (hasMore) messages.pop()

      messages.reverse()

      return NextResponse.json({
        messages,
        nextCursor: hasMore ? messages[0]?.id : null,
        nextCursorCreatedAt: hasMore ? messages[0]?.createdAt.toISOString() : null,
        hasMore,
      })
    }

    // 对话列表（已有逻辑保持不变）
    const grouped = await prisma.openRouterChat.groupBy({
      by: ['conversationId'],
      where: { userId },
      _min: { createdAt: true, id: true },
    })

    const chatHistories = await prisma.openRouterChat.findMany({
      where: {
        id: { in: grouped.map(g => g._min.id).filter(Boolean) as string[] }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        conversationId: true,
        createdAt: true,
      },
    })

    return NextResponse.json(chatHistories, { status: 200 })
  } catch (error) {
    console.error('获取聊天记录失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}