import { randomUUID } from "node:crypto"
import { Injectable, Logger } from "@nestjs/common"
import { PrismaService } from "../database/prisma.service"
import { EmbeddingService } from "./embedding.service"
import { CHUNKING_VERSION, PARSER_VERSION, chunkDocument } from "./chunking"

const STALE_LOCK_MS = 15 * 60 * 1000
const BASE_RETRY_DELAY_MS = 30 * 1000
const EMBEDDING_BATCH_SIZE = Math.max(1, Math.min(128, Number(process.env.INGESTION_EMBEDDING_BATCH_SIZE ?? 64)))
const DOCUMENT_EMBEDDING_MAX_CHARS = 16_000
const DEFAULT_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-8B"

type JobStatus = "QUEUED" | "PROCESSING" | "RETRY" | "COMPLETED" | "FAILED" | "CANCELLED"

interface ClaimedJob {
  id: string
  documentId: string
  userId: string
  documentVersion: number
  attempt: number
  maxAttempts: number
  status: JobStatus
}

class StaleIngestionJobError extends Error {}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async processNextIngestionJob() {
    const job = await this.claimNextJob()
    if (!job) return null
    return this.processClaimedJob(job)
  }

  private async claimNextJob(): Promise<ClaimedJob | null> {
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS)
    const exhausted = await this.prisma.$queryRaw<Array<{ id: string; documentId: string; userId: string; documentVersion: number }>>`
      UPDATE "IngestionJob"
      SET
        "status" = 'FAILED'::"IngestionJobStatus",
        "error" = 'Worker lock expired after the final attempt',
        "lockedAt" = NULL,
        "finishedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "status" = 'PROCESSING'::"IngestionJobStatus"
        AND "lockedAt" < ${staleBefore}
        AND "attempt" >= "maxAttempts"
      RETURNING "id", "documentId", "userId", "documentVersion"
    `

    for (const job of exhausted) {
      await this.prisma.document.updateMany({
        where: { id: job.documentId, userId: job.userId, version: job.documentVersion },
        data: { status: "FAILED", ingestionError: "Worker lock expired after the final attempt" },
      })
    }

    const jobs = await this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE "IngestionJob"
      SET
        "status" = 'PROCESSING'::"IngestionJobStatus",
        "attempt" = "attempt" + 1,
        "lockedAt" = NOW(),
        "startedAt" = COALESCE("startedAt", NOW()),
        "updatedAt" = NOW()
      WHERE "id" = (
        SELECT "id"
        FROM "IngestionJob"
        WHERE (
          ("status" IN ('QUEUED'::"IngestionJobStatus", 'RETRY'::"IngestionJobStatus") AND "availableAt" <= NOW())
          OR ("status" = 'PROCESSING'::"IngestionJobStatus" AND "lockedAt" < ${staleBefore})
        )
        AND "attempt" < "maxAttempts"
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING "id", "documentId", "userId", "documentVersion", "attempt", "maxAttempts", "status"
    `

    return jobs[0] ?? null
  }

  private async markCancelled(jobId: string, reason: string) {
    await this.prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        error: reason,
        lockedAt: null,
        finishedAt: new Date(),
      },
    })
  }

  private async generateChunkEmbeddings(texts: string[]) {
    const embeddings: number[][] = []
    for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
      embeddings.push(...(await this.embeddings.generateEmbeddings(texts.slice(offset, offset + EMBEDDING_BATCH_SIZE))))
    }
    return embeddings
  }

  private async processClaimedJob(job: ClaimedJob) {
    const document = await this.prisma.document.findFirst({
      where: { id: job.documentId, userId: job.userId },
    })

    if (!document || document.version !== job.documentVersion) {
      await this.markCancelled(job.id, "Document was deleted or superseded by a newer version")
      return { jobId: job.id, status: "CANCELLED" as const }
    }

    await this.prisma.document.update({
      where: { id: document.id },
      data: { status: "PROCESSING", ingestionError: null },
    })

    try {
      const chunks = await chunkDocument(document.title, document.content, document.contentType)
      const chunkTexts = chunks.map((chunk) => `${chunk.title}\n${chunk.content}`)
      const [documentEmbedding, chunkEmbeddings] = await Promise.all([
        this.embeddings.generateEmbedding(document.content.slice(0, DOCUMENT_EMBEDDING_MAX_CHARS)),
        this.generateChunkEmbeddings(chunkTexts),
      ])
      const documentEmbeddingString = `[${documentEmbedding.join(",")}]`
      const embeddingModel = process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL

      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.$executeRaw`
          UPDATE "Document"
          SET
            "embedding" = ${documentEmbeddingString}::vector,
            "status" = 'READY'::"DocumentStatus",
            "parserVersion" = ${PARSER_VERSION},
            "chunkingVersion" = ${CHUNKING_VERSION},
            "embeddingModel" = ${embeddingModel},
            "lastIndexedAt" = NOW(),
            "ingestionError" = NULL,
            "updatedAt" = NOW()
          WHERE "id" = ${document.id}
            AND "userId" = ${job.userId}
            AND "version" = ${job.documentVersion}
        `
        if (updated !== 1) throw new StaleIngestionJobError("Document version changed during indexing")

        await tx.$executeRaw`DELETE FROM "DocumentChunk" WHERE "documentId" = ${document.id}`

        for (let index = 0; index < chunks.length; index++) {
          const chunk = chunks[index]
          const embedding = `[${chunkEmbeddings[index].join(",")}]`
          const metadata = JSON.stringify({
            parserVersion: PARSER_VERSION,
            chunkingVersion: CHUNKING_VERSION,
            sourceType: document.sourceType,
            sourceName: document.sourceName,
            sourceUri: document.sourceUri,
          })

          await tx.$executeRaw`
            INSERT INTO "DocumentChunk" (
              "id", "documentId", "title", "content", "chunkIndex", "heading",
              "startOffset", "endOffset", "sourceVersion", "metadata", "embedding", "createdAt"
            ) VALUES (
              ${randomUUID()}, ${document.id}, ${chunk.title}, ${chunk.content}, ${chunk.index}, ${chunk.heading},
              ${chunk.startOffset}, ${chunk.endOffset}, ${job.documentVersion}, ${metadata}::jsonb, ${embedding}::vector, NOW()
            )
          `
        }

        await tx.ingestionJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            error: null,
            lockedAt: null,
            finishedAt: new Date(),
          },
        })
      })

      this.logger.log(`Ingestion completed: job=${job.id} document=${document.id} version=${job.documentVersion} chunks=${chunks.length}`)
      return { jobId: job.id, documentId: document.id, status: "COMPLETED" as const, chunkCount: chunks.length }
    } catch (error) {
      if (error instanceof StaleIngestionJobError) {
        await this.markCancelled(job.id, error.message)
        return { jobId: job.id, status: "CANCELLED" as const }
      }

      const terminal = job.attempt >= job.maxAttempts
      const errorMessage = String(error).slice(0, 4_000)
      const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, job.attempt - 1))

      await this.prisma.$transaction([
        this.prisma.ingestionJob.update({
          where: { id: job.id },
          data: {
            status: terminal ? "FAILED" : "RETRY",
            error: errorMessage,
            lockedAt: null,
            availableAt: terminal ? new Date() : new Date(Date.now() + retryDelay),
            finishedAt: terminal ? new Date() : null,
          },
        }),
        this.prisma.document.updateMany({
          where: { id: document.id, userId: job.userId, version: job.documentVersion },
          data: {
            status: terminal ? "FAILED" : "QUEUED",
            ingestionError: errorMessage,
          },
        }),
      ])

      this.logger.error(`Ingestion failed: job=${job.id} document=${document.id} attempt=${job.attempt} terminal=${terminal} error=${errorMessage}`)
      return { jobId: job.id, documentId: document.id, status: terminal ? ("FAILED" as const) : ("RETRY" as const) }
    }
  }
}
