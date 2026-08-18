import { BadRequestException, Body, Controller, Post } from "@nestjs/common"
import { FeedbackRequestSchema } from "@ai-arg/contracts"
import type { AuthenticatedCurrentUser } from "../auth/auth.types"
import { CurrentUser } from "../auth/current-user.decorator"
import { FeedbackService } from "./feedback.service"

@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  async submitFeedback(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    let request
    try {
      request = FeedbackRequestSchema.parse(body)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    await this.feedback.recordFeedback(user.id, request)
    return { success: true }
  }
}
