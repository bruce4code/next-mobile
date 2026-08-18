import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { AuthModule } from "./auth/auth.module"
import { DatabaseModule } from "./database/database.module"
import { LangSmithModule } from "./langsmith/langsmith.module"
import { HealthController } from "./health.controller"
import { RetrievalModule } from "./retrieval/retrieval.module"
import { IngestionModule } from "./ingestion/ingestion.module"
import { UsersModule } from "./users/users.module"
import { ChatHistoryModule } from "./chat-history/chat-history.module"
import { FeedbackModule } from "./feedback/feedback.module"
import { IngestionJobsModule } from "./ingestion-jobs/ingestion-jobs.module"
import { DocumentsModule } from "./documents/documents.module"
import { RequestLoggerMiddleware } from "./request-logger.middleware"

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ["../../.env", ".env"],
      isGlobal: true,
    }),
    AuthModule,
    DatabaseModule,
    LangSmithModule,
    RetrievalModule,
    IngestionModule,
    UsersModule,
    ChatHistoryModule,
    FeedbackModule,
    IngestionJobsModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*")
  }
}
