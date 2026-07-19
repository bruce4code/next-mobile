import { z } from "zod"

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(12_000),
})

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(30),
  useRAG: z.boolean().optional().default(true),
}).superRefine(({ messages }, context) => {
  const totalCharacters = messages.reduce((total, message) => total + message.content.length, 0)
  if (totalCharacters > 100_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "消息总长度不能超过 100000 个字符",
    })
  }
})

export const RAGCitationSchema = z.object({
  citationId: z.string().max(20),
  documentId: z.string().max(128),
  chunkId: z.string().max(128),
  title: z.string().max(500),
  heading: z.string().max(500).optional(),
  sourceName: z.string().max(500).optional(),
  sourceUri: z.string().max(2_000).optional(),
  sourceVersion: z.number().int().positive(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  score: z.number().min(0).max(1),
})

export const RetrievedDocumentSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  contentType: z.string().min(1),
  heading: z.string().optional(),
  sourceName: z.string().optional(),
  sourceUri: z.string().optional(),
  sourceVersion: z.number().int().positive(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  similarity: z.number().min(0).max(1),
})

export const PrepareRetrievalContextRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(30),
  documents: z.array(RetrievedDocumentSchema).max(10),
})

export const ChatStreamMetadataSchema = z.object({
  type: z.literal("metadata"),
  requestId: z.string().uuid(),
  model: z.string().min(1),
  citations: z.array(RAGCitationSchema).max(10),
})

export const SaveChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"], { message: "role 必须是 user / assistant" }),
  content: z.string().min(1, "content 不能为空").max(100_000),
  model: z.string().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  conversationId: z.string().min(1).max(128),
  metadata: z.object({
    requestId: z.string().uuid().optional(),
    citations: z.array(RAGCitationSchema).max(10).optional(),
  }).optional(),
})

export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>
export type RAGCitation = z.infer<typeof RAGCitationSchema>
export type RetrievedDocument = z.infer<typeof RetrievedDocumentSchema>
export type PrepareRetrievalContextRequest = z.infer<typeof PrepareRetrievalContextRequestSchema>
export type ChatStreamMetadata = z.infer<typeof ChatStreamMetadataSchema>
export type SaveChatMessage = z.infer<typeof SaveChatMessageSchema>
