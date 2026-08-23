import { NestFactory } from "@nestjs/core"
import { ApiExceptionFilter } from "./api-exception.filter"
import { ApiResponseInterceptor } from "./api-response.interceptor"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api")
  app.useGlobalFilters(new ApiExceptionFilter())
  app.useGlobalInterceptors(new ApiResponseInterceptor())
  app.enableShutdownHooks()

  // CORS configuration for browser-direct requests (Phase 2+)
  const webOrigins = (process.env.WEB_ORIGINS ?? "http://localhost:3000,http://localhost:8000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)

  app.enableCors({
    origin: webOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["X-Request-Id"],
    credentials: false,
  })

  const port = Number(process.env.API_PORT ?? 4000)
  await app.listen(port)
}

void bootstrap()
