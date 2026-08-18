import { z } from "zod"

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
})

// User profile
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  name: z.string().max(100).nullable(),
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: z.string().datetime(),
})

export const UpdateUserProfileSchema = z.object({
  name: z.string().max(100).optional(),
  avatarUrl: z.string().url().max(2000).optional(),
})

// Chat history
export const ChatHistoryQuerySchema = z.object({
  conversationId: z.string().min(1).max(128).optional(),
  cursorCreatedAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

export const ChatHistoryMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  model: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const ChatHistoryMessagesResponseSchema = z.object({
  messages: z.array(ChatHistoryMessageSchema),
  nextCursor: z.string().datetime().nullable(),
  nextCursorCreatedAt: z.string().datetime().nullable(),
  hasMore: z.boolean(),
})

// Feedback
export const FeedbackRequestSchema = z.object({
  requestId: z.string().uuid(),
  score: z.union([z.literal(0), z.literal(1)]),
  comment: z.string().max(5000).optional(),
})

export type ApiError = z.infer<typeof ApiErrorSchema>
export type UserProfile = z.infer<typeof UserProfileSchema>
export type UpdateUserProfile = z.infer<typeof UpdateUserProfileSchema>
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuerySchema>
export type ChatHistoryMessage = z.infer<typeof ChatHistoryMessageSchema>
export type ChatHistoryMessagesResponse = z.infer<typeof ChatHistoryMessagesResponseSchema>
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>
