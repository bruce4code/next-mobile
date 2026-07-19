import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { AuthModule } from "./auth/auth.module"
import { HealthController } from "./health.controller"
import { RetrievalModule } from "./retrieval/retrieval.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ["../../.env", ".env"],
      isGlobal: true,
    }),
    AuthModule,
    RetrievalModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
