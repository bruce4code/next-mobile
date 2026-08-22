import { Injectable } from "@nestjs/common"
import type { ChatHistoryQuery } from "@ai-arg/contracts"
import { PrismaService } from "../database/prisma.service"

@Injectable()
export class ChatHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mirrors web GET /api/get-chat, which serves two different shapes from one
   * route: a paged message list when conversationId is given, and a bare array
   * of conversations when it is not.
   */
  async getHistory(userId: string, query: ChatHistoryQuery) {
    if (query.conversationId) {
      return this.getMessages(userId, query)
    }
    return this.getConversations(userId)
  }

  private async getMessages(userId: string, query: ChatHistoryQuery) {
    const { conversationId, cursorCreatedAt, limit } = query

    // No select: web returns whole rows here, so narrowing the projection
    // would drop fields (promptTokens, metadata, …) the client may read.
    const messages = await this.prisma.openRouterChat.findMany({
      where: {
        userId,
        conversationId,
        ...(cursorCreatedAt && { createdAt: { lt: new Date(cursorCreatedAt) } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    })

    const hasMore = messages.length > limit
    if (hasMore) messages.pop()

    // web fetches newest-first to apply the cursor, then reverses so the
    // response reads oldest-first. The cursor therefore points at the first
    // element (the oldest of this page) and is an id, not a timestamp.
    messages.reverse()

    return {
      messages,
      nextCursor: hasMore ? messages[0]?.id ?? null : null,
      nextCursorCreatedAt: hasMore ? messages[0]?.createdAt.toISOString() ?? null : null,
      hasMore,
    }
  }

  private async getConversations(userId: string) {
    const grouped = await this.prisma.openRouterChat.groupBy({
      by: ["conversationId"],
      where: { userId },
      _min: { createdAt: true, id: true },
    })

    return this.prisma.openRouterChat.findMany({
      where: {
        id: { in: grouped.map((g) => g._min.id).filter(Boolean) as string[] },
        userId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        conversationId: true,
        createdAt: true,
      },
    })
  }
}
