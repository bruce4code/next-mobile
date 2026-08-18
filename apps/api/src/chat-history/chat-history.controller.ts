import { BadRequestException, Controller, Get, Query } from "@nestjs/common"
import { ChatHistoryQuerySchema } from "@ai-arg/contracts"
import type { AuthenticatedCurrentUser } from "../auth/auth.types"
import { CurrentUser } from "../auth/current-user.decorator"
import { ChatHistoryService } from "./chat-history.service"

@Controller("chat-history")
export class ChatHistoryController {
  constructor(private readonly chatHistory: ChatHistoryService) {}

  @Get()
  async getHistory(@CurrentUser() user: AuthenticatedUser, @Query() queryParams: unknown) {
    let query
    try {
      query = ChatHistoryQuerySchema.parse(queryParams)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    return this.chatHistory.getMessages(user.id, query)
  }
}
