import { z } from "zod"

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
})

export const ChatHistoryQuerySchema = z.object({
  conversationId: z.string().min(1).max(128).optional(),
  cursorCreatedAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuerySchema>
