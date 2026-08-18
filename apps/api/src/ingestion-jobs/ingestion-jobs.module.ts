import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module"
import { IngestionJobsController } from "./ingestion-jobs.controller"
import { IngestionJobsService } from "./ingestion-jobs.service"

@Module({
  imports: [DatabaseModule],
  controllers: [IngestionJobsController],
  providers: [IngestionJobsService],
})
export class IngestionJobsModule {}
