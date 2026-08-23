import { Injectable, type NestMiddleware } from "@nestjs/common"
import { randomUUID } from "node:crypto"

type RequestLike = {
  requestId?: string
}

type ResponseLike = {
  setHeader(name: string, value: string): void
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestLike, response: ResponseLike, next: () => void) {
    const requestId = randomUUID()
    request.requestId = requestId
    response.setHeader("X-Request-Id", requestId)
    next()
  }
}
