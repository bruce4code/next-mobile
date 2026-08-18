import { Injectable, Logger } from "@nestjs/common"
import type { FeedbackRequest } from "@ai-arg/contracts"
import { LangSmithService } from "../langsmith/langsmith.service"

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name)

  constructor(private readonly langsmith: LangSmithService) {}

  async recordFeedback(userId: string, feedback: FeedbackRequest) {
    this.logger.log({
      event: "Feedback.Received",
      userId,
      requestId: feedback.requestId,
      score: feedback.score,
      hasComment: Boolean(feedback.comment),
    })

    // Send to LangSmith
    await this.langsmith.createFeedback({
      runId: feedback.requestId,
      score: feedback.score,
      comment: feedback.comment,
      userId,
    })
  }
}
