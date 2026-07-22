import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { AuthModule } from "./auth/auth.module"
import { DatabaseModule } from "./database/database.module"
import { HealthController } from "./health.controller"
import { RetrievalModule } from "./retrieval/retrieval.module"
import { RequestLoggerMiddleware } from "./request-logger.middleware"

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ["../../.env", ".env"],
      isGlobal: true,
    }),
    AuthModule,
    DatabaseModule,
    RetrievalModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*")
  }
}
