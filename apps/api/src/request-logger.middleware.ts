import { Injectable, Logger, type NestMiddleware } from "@nestjs/common"

type RequestLike = {
  method: string
  originalUrl: string
}

type ResponseLike = {
  statusCode: number
  on(event: "finish", listener: () => void): void
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP")

  use(request: RequestLike, response: ResponseLike, next: () => void) {
    const startedAt = performance.now()
    response.on("finish", () => {
      const durationMs = Math.round(performance.now() - startedAt)
      this.logger.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs}ms`)
    })
    next()
  }
}
