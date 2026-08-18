import { BadRequestException, Controller, Post, Body, Sse, MessageEvent } from "@nestjs/common"
import { Observable } from "rxjs"
import { ChatRequestSchema } from "@ai-arg/contracts"
import type { AuthenticatedUser } from "../auth/auth.types"
import { CurrentUser } from "../auth/current-user.decorator"
import { ChatService } from "./chat.service"

@Controller("chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @Sse()
  async streamChat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<Observable<MessageEvent>> {
    let request
    try {
      request = ChatRequestSchema.parse(body)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    return this.chat.streamChatCompletion(user.id, request)
  }
}
