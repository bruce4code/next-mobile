import { Client } from "langsmith"
import { Injectable, Logger } from "@nestjs/common"

@Injectable()
export class LangSmithService {
  private readonly client: Client
  private readonly logger = new Logger(LangSmithService.name)
  private readonly enabled: boolean

  constructor() {
    // The langsmith SDK reads LANGSMITH_API_KEY (LANGCHAIN_API_KEY is the
    // older alias it still honours). Accept both so this matches whichever
    // name the shared .env uses.
    const apiKey = process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY
    this.enabled = Boolean(apiKey)

    if (this.enabled) {
      this.client = new Client({ apiKey })
      this.logger.log("LangSmith client initialized")
    } else {
      this.logger.warn("LANGSMITH_API_KEY not set, LangSmith disabled")
      // Create a dummy client to avoid null checks
      this.client = new Client()
    }
  }

  async createFeedback(params: { runId: string; score: number; comment?: string; userId?: string }) {
    if (!this.enabled) {
      this.logger.debug("LangSmith disabled, skipping feedback")
      return null
    }

    try {
      const { runId, score, comment, userId } = params

      await this.client.createRun({
        name: `User Feedback — ${runId}`,
        run_type: "chain",
        inputs: { requestId: runId, score, comment: comment ?? "" },
        outputs: {},
        extra: {
          metadata: {
            userId,
            feedbackScore: score,
            hasComment: Boolean(comment),
          },
        },
      })

      this.logger.log({
        event: "Feedback.SentToLangSmith",
        runId,
        score,
        userId,
      })

      return { success: true }
    } catch (error) {
      this.logger.error({
        event: "Feedback.LangSmithError",
        error,
        runId: params.runId,
      })
      // Don't throw - feedback is non-critical
      return null
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }
}
