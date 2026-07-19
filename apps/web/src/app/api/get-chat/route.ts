import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUser } from '@/app/auth/server'
import { z } from 'zod'

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

const QuerySchema = z.object({
  conversationId: z.string().min(1).max(128).optional(),
  cursorCreatedAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export async function GET(request: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse({
      conversationId: searchParams.get('conversationId') ?? undefined,
      cursorCreatedAt: searchParams.get('cursorCreatedAt') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '请求参数校验失败', details: parsed.error.issues }, { status: 400 })
    }

    const { conversationId, cursorCreatedAt, limit } = parsed.data

    if (conversationId) {
      const where: Record<string, unknown> = { conversationId, userId: user.id }

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
      where: { userId: user.id },
      _min: { createdAt: true, id: true },
    })

    const chatHistories = await prisma.openRouterChat.findMany({
      where: {
        id: { in: grouped.map(g => g._min.id).filter(Boolean) as string[] },
        userId: user.id,
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
