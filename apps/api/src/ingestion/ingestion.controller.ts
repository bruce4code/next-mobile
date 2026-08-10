import { timingSafeEqual } from "node:crypto"
import { BadRequestException, Body, Controller, Headers, Post, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common"
import { ProcessIngestionRequestSchema } from "@ai-arg/contracts"
import { Public } from "../auth/public.decorator"
import { IngestionService } from "./ingestion.service"

@Controller("ingestion")
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Public()
  @Post("process")
  async process(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    if (!process.env.INGESTION_WORKER_SECRET) {
      throw new ServiceUnavailableException({ error: "Worker secret 未配置" })
    }
    if (!this.hasValidWorkerSecret(authorization)) {
      throw new UnauthorizedException({ error: "未授权" })
    }

    let request: { limit: number }
    try {
      request = ProcessIngestionRequestSchema.parse(body ?? {})
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    const results = []
    for (let index = 0; index < request.limit; index++) {
      const result = await this.ingestion.processNextIngestionJob()
      if (!result) break
      results.push(result)
    }

    return { processed: results.length, results }
  }

  private hasValidWorkerSecret(authorization: string | undefined): boolean {
    const expected = process.env.INGESTION_WORKER_SECRET
    const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : ""
    if (!expected || !supplied || expected.length !== supplied.length) return false
    return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  }
}
