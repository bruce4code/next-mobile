import { z } from "zod"

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().min(1),
  data: z.null(),
  requestId: z.string().uuid(),
  details: z.unknown().optional(),
})

export const ApiSuccessSchema = z.object({
  error: z.null(),
  code: z.literal("OK"),
  data: z.unknown(),
  requestId: z.string().uuid(),
})

// User profile
// Field set mirrors web GET /api/user exactly (apps/web/src/app/api/user/route.web.ts).
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  name: z.string().max(100).nullable(),
  bio: z.string().max(500).nullable(),
  avatarUrl: z.string().nullable(),
  location: z.string().max(200).nullable(),
  createdAt: z.string().datetime(),
})

// PUT response omits createdAt, matching web.
export const UpdateUserProfileResponseSchema = UserProfileSchema.omit({ createdAt: true })

// Mirrors web's UpdateProfileSchema, including the empty-string escape hatch
// for clearing an avatar.
export const UpdateUserProfileSchema = z.object({
  name: z.string().max(100, "姓名不超过 100 个字符").optional(),
  bio: z.string().max(500, "个人简介不超过 500 个字符").optional(),
  avatarUrl: z.string().url("头像链接格式不正确").or(z.literal("")).optional(),
  location: z.string().max(200, "位置不超过 200 个字符").optional(),
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

/**
 * Without conversationId, web GET /api/get-chat returns a bare array of
 * conversation entries — the earliest message of each conversation — not an
 * object. The shape differs entirely from the paged-messages branch, so it is
 * modelled separately rather than folded into one schema.
 */
export const ChatHistoryConversationSchema = z.object({
  id: z.string(),
  content: z.string(),
  conversationId: z.string(),
  createdAt: z.string().datetime(),
})

export const ChatHistoryConversationsResponseSchema = z.array(ChatHistoryConversationSchema)

// Feedback
export const FeedbackRequestSchema = z.object({
  requestId: z.string().uuid(),
  score: z.union([z.literal(0), z.literal(1)]),
  comment: z.string().max(5000).optional(),
})

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ApiSuccess = z.infer<typeof ApiSuccessSchema>
export type UserProfile = z.infer<typeof UserProfileSchema>
export type UpdateUserProfileResponse = z.infer<typeof UpdateUserProfileResponseSchema>
export type UpdateUserProfile = z.infer<typeof UpdateUserProfileSchema>
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuerySchema>
export type ChatHistoryMessage = z.infer<typeof ChatHistoryMessageSchema>
export type ChatHistoryMessagesResponse = z.infer<typeof ChatHistoryMessagesResponseSchema>
export type ChatHistoryConversation = z.infer<typeof ChatHistoryConversationSchema>
export type ChatHistoryConversationsResponse = z.infer<typeof ChatHistoryConversationsResponseSchema>
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>
