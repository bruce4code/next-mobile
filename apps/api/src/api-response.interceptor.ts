import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { Observable, map } from "rxjs"

type RequestLike = {
  originalUrl?: string
  requestId?: string
}

type SuccessResponse<T> = {
  code: "OK"
  error: null
  data: T
  requestId: string
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>()

    // SSE events are a frozen wire protocol, not JSON API resources.
    if (request.originalUrl?.split("?")[0] === "/api/chat") {
      return next.handle()
    }

    const requestId = request.requestId ?? randomUUID()
    return next.handle().pipe(
      map((data): SuccessResponse<unknown> => ({
        code: "OK",
        error: null,
        data,
        requestId,
      })),
    )
  }
}
