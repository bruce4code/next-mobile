import { Injectable, Logger } from "@nestjs/common"
import type { FeedbackRequest } from "@ai-arg/contracts"

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name)

  async recordFeedback(userId: string, feedback: FeedbackRequest) {
    // TODO: Integrate LangSmith Client.createFeedback when langsmith is added
    // For now, just log it
    this.logger.log({
      event: "Feedback.Received",
      userId,
      requestId: feedback.requestId,
      score: feedback.score,
      hasComment: Boolean(feedback.comment),
    })

    // Placeholder: In Phase 3 this will call:
    // await this.langsmith.createFeedback({ runId: feedback.requestId, score: feedback.score, comment: feedback.comment })
  }
}
