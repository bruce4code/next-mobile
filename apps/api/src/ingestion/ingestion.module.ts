import { Module } from "@nestjs/common"
import { IngestionController } from "./ingestion.controller"
import { IngestionService } from "./ingestion.service"
import { EmbeddingService } from "./embedding.service"

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, EmbeddingService],
  exports: [IngestionService, EmbeddingService],
})
export class IngestionModule {}
