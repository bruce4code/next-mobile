import { Injectable } from "@nestjs/common"
import { PrismaService } from "../database/prisma.service"

@Injectable()
export class IngestionJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async getJobStatus(userId: string, jobId: string) {
    const job = await this.prisma.ingestionJob.findFirst({
      where: { id: jobId, userId },
      select: {
        id: true,
        documentId: true,
        status: true,
        attempt: true,
        maxAttempts: true,
        error: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    })

    if (!job) return null

    return {
      ...job,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    }
  }
}
