import { z } from "zod"

export const DocumentContentTypeSchema = z.enum(["text", "markdown"])
export const DocumentSourceTypeSchema = z.enum(["inline", "upload", "import"])

export const CreateDocumentSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(500),
  content: z.string().trim().min(1, "内容不能为空").max(1_000_000),
  contentType: DocumentContentTypeSchema.optional().default("text"),
  category: z.string().trim().max(100).optional(),
  sourceType: DocumentSourceTypeSchema.optional().default("inline"),
  sourceName: z.string().trim().max(500).optional(),
})

export const UpdateDocumentSchema = CreateDocumentSchema
  .omit({ sourceType: true, sourceName: true })
  .partial()
  .extend({
    category: z.string().trim().max(100).nullable().optional(),
  })
  .refine((document) => Object.keys(document).length > 0, "至少需要提供一个更新字段")

export const DocumentQuerySchema = z.object({
  category: z.string().trim().max(100).optional(),
  search: z.string().trim().min(1).max(500).optional(),
})

export const ProcessIngestionRequestSchema = z.object({
  limit: z.number().int().min(1).max(10).optional().default(1),
})

export const DocumentItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.string().nullable(),
  contentType: z.string(),
  status: z.enum(["QUEUED", "INDEXING", "READY", "FAILED"]),
  sourceType: z.string(),
  sourceName: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastIndexedAt: z.string().datetime().nullable(),
})

export const DocumentListResponseSchema = z.object({
  items: z.array(DocumentItemSchema),
  total: z.number().int().nonnegative(),
})

export const IngestionJobStatusSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  status: z.enum(["QUEUED", "PROCESSING", "RETRY", "COMPLETED", "FAILED", "CANCELLED"]),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
})

export type CreateDocument = z.infer<typeof CreateDocumentSchema>
export type UpdateDocument = z.infer<typeof UpdateDocumentSchema>
export type DocumentQuery = z.infer<typeof DocumentQuerySchema>
export type ProcessIngestionRequest = z.infer<typeof ProcessIngestionRequestSchema>
export type DocumentItem = z.infer<typeof DocumentItemSchema>
export type DocumentListResponse = z.infer<typeof DocumentListResponseSchema>
export type IngestionJobStatus = z.infer<typeof IngestionJobStatusSchema>
