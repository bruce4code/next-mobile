import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const conversationId = searchParams.get('conversationId')

    // 添加缓存头
    const response = NextResponse.next()
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

    if (!userId && !conversationId) {
      return NextResponse.json({ error: '缺少 userId 或 conversationId 参数' }, { status: 400 })
    }

    if (conversationId) {
      // 如果提供了 conversationId，则获取该会话的所有消息
      const messages = await prisma.openRouterChat.findMany({
        where: {
          conversationId: conversationId,
          // 如果需要，也可以在这里加入 userId 进行双重验证
          ...(userId && { userId }), 
        },
        orderBy: { createdAt: 'asc' }, // 按时间升序排列消息
      })
      return NextResponse.json(messages, { status: 200 })
    } else if (userId) {
      // 如果只提供了 userId，则获取用户的聊天历史列表 (每个 conversationId 的第一条消息)
      const grouped = await prisma.openRouterChat.groupBy({
        by: ['conversationId'],
        where: { userId },
        _min: { createdAt: true, id: true }, // 获取每个会话中最早创建的消息的ID
      })

      const chatHistories = await prisma.openRouterChat.findMany({
        where: {
          id: { in: grouped.map(g => g._min.id).filter(Boolean) as string[] } // 类型断言为 string[]
        },
        orderBy: { createdAt: 'desc' }, // 聊天历史列表按最新会话排序
        select: {
          id: true,
          content: true,
          conversationId: true,
          createdAt: true, // 确保 createdAt 被选中，以便 AppSidebar 可以使用
          // 根据需要选择其他字段
        },
      })
      return NextResponse.json(chatHistories, { status: 200 })
    }

    // Fallback, 理论上不会执行到这里，因为上面已经处理了所有情况
    return NextResponse.json({ error: '无效的请求参数' }, { status: 400 });

  } catch (error) {
    console.error('获取聊天记录失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}