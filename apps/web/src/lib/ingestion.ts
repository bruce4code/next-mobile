import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import prisma from './prisma'
import { chunkDocument, CHUNKING_VERSION, PARSER_VERSION } from './chunking'
import { generateEmbedding, generateEmbeddings } from './embedding'
import { DEFAULT_EMBEDDING_MODEL } from './llm-config'
import { logger } from './logger'

const STALE_LOCK_MS = 15 * 60 * 1000
const BASE_RETRY_DELAY_MS = 30 * 1000
const EMBEDDING_BATCH_SIZE = Math.max(1, Math.min(128, Number(process.env.INGESTION_EMBEDDING_BATCH_SIZE ?? 64)))
const DOCUMENT_EMBEDDING_MAX_CHARS = 16_000

type JobStatus = 'QUEUED' | 'PROCESSING' | 'RETRY' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

interface ClaimedJob {
  id: string
  documentId: string
  userId: string
  documentVersion: number
  attempt: number
  maxAttempts: number
  status: JobStatus
}

interface EnqueueDocumentInput {
  userId: string
  title: string
  content: string
  contentType: string
  category?: string
  metadata?: Record<string, unknown>
  sourceType?: string
  sourceName?: string
  sourceUri?: string
  idempotencyKey: string
}

interface ReindexDocumentInput {
  documentId: string
  userId: string
  title: string
  content: string
  contentType: string
  category: string | null
  idempotencyKey: string
}

class StaleIngestionJobError extends Error {}

function checksum(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

export async function enqueueDocumentIngestion(input: EnqueueDocumentInput) {
  const existingJob = await prisma.ingestionJob.findUnique({
    where: {
      userId_idempotencyKey: {
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { document: true },
  })

  if (existingJob) {
    return { document: existingJob.document, job: existingJob, deduplicated: true }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          userId: input.userId,
          title: input.title,
          content: input.content,
          contentType: input.contentType,
          category: input.category,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
          status: 'QUEUED',
          sourceType: input.sourceType ?? 'inline',
          sourceName: input.sourceName,
          sourceUri: input.sourceUri,
          sourceChecksum: checksum(input.content),
          version: 1,
        },
      })

      const job = await tx.ingestionJob.create({
        data: {
          documentId: document.id,
          userId: input.userId,
          documentVersion: document.version,
          operation: 'INDEX',
          idempotencyKey: input.idempotencyKey,
        },
      })

      return { document, job, deduplicated: false }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await prisma.ingestionJob.findUniqueOrThrow({
        where: {
          userId_idempotencyKey: {
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { document: true },
      })
      return { document: duplicate.document, job: duplicate, deduplicated: true }
    }
    throw error
  }
}

export async function enqueueDocumentReindex(input: ReindexDocumentInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
    })
    if (!existing) return null

    const document = await tx.document.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        content: input.content,
        contentType: input.contentType,
        category: input.category,
        sourceChecksum: checksum(input.content),
        version: { increment: 1 },
        status: 'QUEUED',
        ingestionError: null,
      },
    })

    await tx.ingestionJob.updateMany({
      where: {
        documentId: document.id,
        status: { in: ['QUEUED', 'RETRY'] },
      },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    })

    const job = await tx.ingestionJob.create({
      data: {
        documentId: document.id,
        userId: input.userId,
        documentVersion: document.version,
        operation: 'REINDEX',
        idempotencyKey: input.idempotencyKey,
      },
    })

    return { document, job }
  })
}

async function claimNextJob(): Promise<ClaimedJob | null> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS)
  const exhausted = await prisma.$queryRaw<Array<{ id: string; documentId: string; userId: string; documentVersion: number }>>`
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
    await prisma.document.updateMany({
      where: { id: job.documentId, userId: job.userId, version: job.documentVersion },
      data: { status: 'FAILED', ingestionError: 'Worker lock expired after the final attempt' },
    })
  }

  const jobs = await prisma.$queryRaw<ClaimedJob[]>`
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

async function markCancelled(jobId: string, reason: string) {
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      error: reason,
      lockedAt: null,
      finishedAt: new Date(),
    },
  })
}

async function generateChunkEmbeddings(texts: string[]) {
  const embeddings: number[][] = []
  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
    embeddings.push(...await generateEmbeddings(texts.slice(offset, offset + EMBEDDING_BATCH_SIZE)))
  }
  return embeddings
}

async function processClaimedJob(job: ClaimedJob) {
  const document = await prisma.document.findFirst({
    where: { id: job.documentId, userId: job.userId },
  })

  if (!document || document.version !== job.documentVersion) {
    await markCancelled(job.id, 'Document was deleted or superseded by a newer version')
    return { jobId: job.id, status: 'CANCELLED' as const }
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { status: 'PROCESSING', ingestionError: null },
  })

  try {
    const chunks = await chunkDocument(document.title, document.content, document.contentType)
    const chunkTexts = chunks.map((chunk) => `${chunk.title}\n${chunk.content}`)
    const [documentEmbedding, chunkEmbeddings] = await Promise.all([
      generateEmbedding(document.content.slice(0, DOCUMENT_EMBEDDING_MAX_CHARS)),
      generateChunkEmbeddings(chunkTexts),
    ])
    const documentEmbeddingString = `[${documentEmbedding.join(',')}]`

    await prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE "Document"
        SET
          "embedding" = ${documentEmbeddingString}::vector,
          "status" = 'READY'::"DocumentStatus",
          "parserVersion" = ${PARSER_VERSION},
          "chunkingVersion" = ${CHUNKING_VERSION},
          "embeddingModel" = ${DEFAULT_EMBEDDING_MODEL},
          "lastIndexedAt" = NOW(),
          "ingestionError" = NULL,
          "updatedAt" = NOW()
        WHERE "id" = ${document.id}
          AND "userId" = ${job.userId}
          AND "version" = ${job.documentVersion}
      `
      if (updated !== 1) throw new StaleIngestionJobError('Document version changed during indexing')

      await tx.$executeRaw`DELETE FROM "DocumentChunk" WHERE "documentId" = ${document.id}`

      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index]
        const embedding = `[${chunkEmbeddings[index].join(',')}]`
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
            ${crypto.randomUUID()}, ${document.id}, ${chunk.title}, ${chunk.content}, ${chunk.index}, ${chunk.heading},
            ${chunk.startOffset}, ${chunk.endOffset}, ${job.documentVersion}, ${metadata}::jsonb, ${embedding}::vector, NOW()
          )
        `
      }

      await tx.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          error: null,
          lockedAt: null,
          finishedAt: new Date(),
        },
      })
    })

    logger.info('Ingestion.Completed', {
      jobId: job.id,
      documentId: document.id,
      documentVersion: job.documentVersion,
      chunkCount: chunks.length,
    })
    return { jobId: job.id, documentId: document.id, status: 'COMPLETED' as const, chunkCount: chunks.length }
  } catch (error) {
    if (error instanceof StaleIngestionJobError) {
      await markCancelled(job.id, error.message)
      return { jobId: job.id, status: 'CANCELLED' as const }
    }

    const terminal = job.attempt >= job.maxAttempts
    const errorMessage = String(error).slice(0, 4_000)
    const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, job.attempt - 1))

    await prisma.$transaction([
      prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: terminal ? 'FAILED' : 'RETRY',
          error: errorMessage,
          lockedAt: null,
          availableAt: terminal ? new Date() : new Date(Date.now() + retryDelay),
          finishedAt: terminal ? new Date() : null,
        },
      }),
      prisma.document.updateMany({
        where: { id: document.id, userId: job.userId, version: job.documentVersion },
        data: {
          status: terminal ? 'FAILED' : 'QUEUED',
          ingestionError: errorMessage,
        },
      }),
    ])

    logger.error('Ingestion.Failed', {
      jobId: job.id,
      documentId: document.id,
      attempt: job.attempt,
      terminal,
      error: errorMessage,
    })
    return { jobId: job.id, documentId: document.id, status: terminal ? 'FAILED' as const : 'RETRY' as const }
  }
}

export async function processNextIngestionJob() {
  const job = await claimNextJob()
  if (!job) return null
  return processClaimedJob(job)
}
