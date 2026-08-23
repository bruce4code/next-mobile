import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common"
import { randomUUID } from "node:crypto"

type RequestLike = {
  requestId?: string
}

type ResponseLike = {
  status(statusCode: number): ResponseLike
  setHeader(name: string, value: string): void
  json(body: unknown): void
}

type ExceptionBody = {
  code?: unknown
  details?: unknown
  error?: unknown
  message?: unknown
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp()
    const request = context.getRequest<RequestLike>()
    const response = context.getResponse<ResponseLike>()
    const requestId = request.requestId ?? randomUUID()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const body = this.getBody(exception)
    const isInternalError = status >= HttpStatus.INTERNAL_SERVER_ERROR

    if (isInternalError) {
      this.logger.error({ exception, requestId, status })
    }

    if (requestId) {
      response.setHeader("X-Request-Id", requestId)
    }

    response.status(status).json({
      error: this.getErrorMessage(body, isInternalError),
      code: this.getErrorCode(body, status),
      data: null,
      requestId,
      ...(isInternalError || body.details === undefined ? {} : { details: body.details }),
    })
  }

  private getBody(exception: unknown): ExceptionBody {
    if (!(exception instanceof HttpException)) {
      return {}
    }

    const response = exception.getResponse()
    if (typeof response === "string") {
      return { message: response }
    }

    return response
  }

  private getErrorMessage(body: ExceptionBody, isInternalError: boolean) {
    if (isInternalError) {
      return "服务暂时不可用，请稍后重试"
    }

    if (typeof body.error === "string") {
      return body.error
    }

    if (typeof body.message === "string") {
      return body.message
    }

    return "请求失败"
  }

  private getErrorCode(body: ExceptionBody, status: number) {
    if (typeof body.code === "string" && body.code.length > 0) {
      return body.code
    }

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "VALIDATION_ERROR"
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED"
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN"
      case HttpStatus.NOT_FOUND:
        return "RESOURCE_NOT_FOUND"
      case HttpStatus.CONFLICT:
        return "CONFLICT"
      case HttpStatus.TOO_MANY_REQUESTS:
        return "RATE_LIMITED"
      case HttpStatus.SERVICE_UNAVAILABLE:
        return "SERVICE_UNAVAILABLE"
      default:
        return "INTERNAL_SERVER_ERROR"
    }
  }
}
