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

export type CreateDocument = z.infer<typeof CreateDocumentSchema>
export type UpdateDocument = z.infer<typeof UpdateDocumentSchema>
export type DocumentQuery = z.infer<typeof DocumentQuerySchema>
export type ProcessIngestionRequest = z.infer<typeof ProcessIngestionRequestSchema>
