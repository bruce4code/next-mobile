import { Injectable } from "@nestjs/common"
import type { ChatHistoryQuery } from "@ai-arg/contracts"
import { PrismaService } from "../database/prisma.service"

@Injectable()
export class ChatHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getMessages(userId: string, query: ChatHistoryQuery) {
    const { conversationId, cursorCreatedAt, limit } = query

    const messages = await this.prisma.openRouterChat.findMany({
      where: {
        userId,
        ...(conversationId && { conversationId }),
        ...(cursorCreatedAt && { createdAt: { lt: new Date(cursorCreatedAt) } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        role: true,
        content: true,
        model: true,
        createdAt: true,
      },
    })

    const hasMore = messages.length > limit
    const items = hasMore ? messages.slice(0, limit) : messages

    return {
      messages: items.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() ?? null : null,
      nextCursorCreatedAt: hasMore ? items[items.length - 1]?.createdAt.toISOString() ?? null : null,
      hasMore,
    }
  }
}
