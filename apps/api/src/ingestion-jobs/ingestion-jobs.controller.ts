import { Controller, Get, NotFoundException, Param } from "@nestjs/common"
import type { AuthenticatedCurrentUser } from "../auth/auth.types"
import { CurrentUser } from "../auth/current-user.decorator"
import { IngestionJobsService } from "./ingestion-jobs.service"

@Controller("ingestion-jobs")
export class IngestionJobsController {
  constructor(private readonly jobs: IngestionJobsService) {}

  @Get(":id")
  async getJobStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") jobId: string) {
    const job = await this.jobs.getJobStatus(user.id, jobId)
    if (!job) {
      throw new NotFoundException({ error: "任务不存在" })
    }
    return job
  }
}
