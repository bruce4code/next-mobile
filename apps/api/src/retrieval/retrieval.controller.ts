import { BadRequestException, Body, Controller, Post } from "@nestjs/common"
import { PrepareRetrievalContextRequestSchema, type PrepareRetrievalContextRequest } from "@ai-arg/contracts"
import { SearchRetrievalRequestSchema, type SearchRetrievalRequest } from "@ai-arg/contracts"
import { CurrentUser } from "../auth/current-user.decorator"
import type { AuthenticatedUser } from "../auth/auth.types"
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

  @Post("search")
  async search(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    let request: SearchRetrievalRequest
    try {
      request = SearchRetrievalRequestSchema.parse(body)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    const documents = await this.retrieval.hybridSearch(user.id, request)
    return {
      documents,
      citations: this.retrieval.toCitations(documents),
      context: this.retrieval.buildContext(documents),
    }
  }
}
