import { BadRequestException, Body, Controller, Post } from "@nestjs/common"
import { PrepareRetrievalContextRequestSchema, type PrepareRetrievalContextRequest } from "@ai-arg/contracts"
import { RetrievalService } from "./retrieval.service"

@Controller("retrieval")
export class RetrievalController {
  constructor(private readonly retrieval: RetrievalService) {}

  @Post("prepare-context")
  prepareContext(@Body() body: unknown) {
    let request: PrepareRetrievalContextRequest
    try {
      request = PrepareRetrievalContextRequestSchema.parse(body)
    } catch (error) {
      throw new BadRequestException({
        error: "请求参数校验失败",
        details: error,
      })
    }

    return {
      query: this.retrieval.rewriteQuery(request.messages),
      citations: this.retrieval.toCitations(request.documents),
      context: this.retrieval.buildContext(request.documents),
    }
  }
}
