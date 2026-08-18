import { Injectable, Logger } from "@nestjs/common"
import { createClient } from "@supabase/supabase-js"
import type { CreateDocument, DocumentQuery, UpdateDocument } from "@ai-arg/contracts"
import { PrismaService } from "../database/prisma.service"

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: DocumentQuery) {
    const { category, search } = query

    const where = {
      userId,
      ...(category && { category }),
      ...(search && {
        OR: [{ title: { contains: search, mode: "insensitive" as const } }, { content: { contains: search, mode: "insensitive" as const } }],
      }),
    }

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          category: true,
          contentType: true,
          status: true,
          sourceType: true,
          sourceName: true,
          createdAt: true,
          lastIndexedAt: true,
        },
      }),
      this.prisma.document.count({ where }),
    ])

    return {
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        lastIndexedAt: item.lastIndexedAt?.toISOString() ?? null,
      })),
      total,
    }
  }

  async get(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        content: true,
        contentType: true,
        category: true,
        status: true,
        sourceType: true,
        sourceName: true,
        sourceUri: true,
        createdAt: true,
        lastIndexedAt: true,
        ingestionError: true,
      },
    })

    if (!doc) return null

    return {
      ...doc,
      createdAt: doc.createdAt.toISOString(),
      lastIndexedAt: doc.lastIndexedAt?.toISOString() ?? null,
    }
  }

  async create(userId: string, data: CreateDocument) {
    const { title, content, contentType, category, sourceType, sourceName } = data

    const checksum = this.calculateChecksum(content)
    const idempotencyKey = `create-${checksum}`

    // Enqueue ingestion
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          userId,
          title,
          content,
          contentType,
          category,
          sourceType: sourceType ?? "inline",
          sourceName,
          sourceChecksum: checksum,
          status: "QUEUED",
          version: 1,
        },
      })

      const job = await tx.ingestionJob.create({
        data: {
          documentId: document.id,
          userId,
          documentVersion: document.version,
          operation: "INDEX",
          idempotencyKey,
        },
      })

      return { document, job }
    })

    this.logger.log({
      event: "Document.Created",
      documentId: result.document.id,
      jobId: result.job.id,
    })

    return {
      ...result.document,
      createdAt: result.document.createdAt.toISOString(),
      lastIndexedAt: result.document.lastIndexedAt?.toISOString() ?? null,
      jobId: result.job.id,
    }
  }

  async update(userId: string, id: string, data: UpdateDocument) {
    const existing = await this.prisma.document.findFirst({
      where: { id, userId },
    })

    if (!existing) return null

    const updateData: Record<string, unknown> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.contentType !== undefined) updateData.contentType = data.contentType
    if (data.category !== undefined) updateData.category = data.category

    // If content changed, re-enqueue
    if (data.content !== undefined && data.content !== existing.content) {
      updateData.content = data.content
      updateData.sourceChecksum = this.calculateChecksum(data.content)
      updateData.status = "QUEUED"
      updateData.version = existing.version + 1

      const doc = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.document.update({
          where: { id, userId },
          data: updateData,
        })

        await tx.ingestionJob.create({
          data: {
            documentId: updated.id,
            userId,
            documentVersion: updated.version,
            operation: "REINDEX",
            idempotencyKey: `reindex-${updated.id}-${updated.version}`,
          },
        })

        return updated
      })

      return {
        ...doc,
        createdAt: doc.createdAt.toISOString(),
        lastIndexedAt: doc.lastIndexedAt?.toISOString() ?? null,
      }
    }

    const doc = await this.prisma.document.update({
      where: { id, userId },
      data: updateData,
    })

    return {
      ...doc,
      createdAt: doc.createdAt.toISOString(),
      lastIndexedAt: doc.lastIndexedAt?.toISOString() ?? null,
    }
  }

  async delete(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      select: { id: true, sourceUri: true },
    })

    if (!doc) return false

    // Delete from Supabase storage if it's an upload
    if (doc.sourceUri?.startsWith("supabase://")) {
      try {
        await this.deleteFromStorage(userId, doc.sourceUri)
      } catch (error) {
        this.logger.warn({ event: "Storage.DeleteFailed", documentId: id, error })
      }
    }

    await this.prisma.document.delete({
      where: { id, userId },
    })

    this.logger.log({ event: "Document.Deleted", documentId: id })
    return true
  }

  private calculateChecksum(content: string): string {
    const crypto = require("node:crypto")
    return crypto.createHash("sha256").update(content).digest("hex")
  }

  private async deleteFromStorage(userId: string, sourceUri: string) {
    // Extract bucket and path from sourceUri: supabase://bucket/path
    const match = sourceUri.match(/^supabase:\/\/([^/]+)\/(.+)$/)
    if (!match) return

    const [, bucket, path] = match

    // Create per-user Supabase client (no token available here, skip for now)
    // In a real implementation, we'd need to pass the user's token through
    // For now, just log it
    this.logger.log({
      event: "Storage.DeleteScheduled",
      bucket,
      path,
      userId,
    })
  }
}
