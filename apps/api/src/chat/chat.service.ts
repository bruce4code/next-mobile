import { Injectable, Logger, MessageEvent } from "@nestjs/common"
import { Observable } from "rxjs"
import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import type { ChatRequest } from "@ai-arg/contracts"
import { PrismaService } from "../database/prisma.service"
import { RetrievalService } from "../retrieval/retrieval.service"

const DEFAULT_MODEL = "openai/gpt-4o-mini"
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private readonly openai: OpenAI

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
  ) {
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is required")
    }

    this.openai = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    })
  }

  streamChatCompletion(userId: string, request: ChatRequest): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const requestId = randomUUID()
      const conversationId = randomUUID()

      this.logger.log({
        event: "Chat.Started",
        requestId,
        userId,
        messageCount: request.messages.length,
        useRAG: request.useRAG,
      })

      const processStream = async () => {
        try {
          // Save user message
          const userMessage = request.messages[request.messages.length - 1]
          await this.prisma.openRouterChat.create({
            data: {
              userId,
              conversationId,
              role: "user",
              content: userMessage.content,
              model: null,
            },
          })

          // RAG retrieval if enabled
          let ragContext = ""
          const citations: unknown[] = []

          if (request.useRAG && userMessage.content) {
            try {
              const searchResult = await this.retrieval.hybridSearch(userId, {
                query: userMessage.content,
                topK: 5,
                minSimilarity: 0.5,
              })

              if (searchResult.decision.outcome === "ANSWER" && searchResult.documents.length > 0) {
                ragContext = searchResult.documents
                  .map((doc) => `【${doc.title}】\n${doc.content}`)
                  .join("\n\n")
                // TODO: Build proper citations from searchResult.documents
              }
            } catch (error) {
              this.logger.warn({ event: "RAG.SearchFailed", error })
              // Continue without RAG
            }
          }

          // Build messages for OpenRouter
          const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))

          // Prepend RAG context if available
          if (ragContext) {
            messages.unshift({
              role: "system",
              content: `参考以下知识库内容回答用户问题：\n\n${ragContext}`,
            })
          }

          // Stream from OpenRouter
          const stream = await this.openai.chat.completions.create({
            model: DEFAULT_MODEL,
            messages,
            stream: true,
          })

          let assistantContent = ""

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) {
              assistantContent += delta
              subscriber.next({
                data: JSON.stringify({ type: "delta", content: delta }),
              })
            }
          }

          // Send metadata
          subscriber.next({
            data: JSON.stringify({
              type: "metadata",
              requestId,
              model: DEFAULT_MODEL,
              citations,
            }),
          })

          // Save assistant message
          await this.prisma.openRouterChat.create({
            data: {
              userId,
              conversationId,
              role: "assistant",
              content: assistantContent,
              model: DEFAULT_MODEL,
            },
          })

          this.logger.log({
            event: "Chat.Completed",
            requestId,
            userId,
            tokensGenerated: assistantContent.length,
          })

          subscriber.complete()
        } catch (error) {
          this.logger.error({
            event: "Chat.Error",
            requestId,
            userId,
            error,
          })

          subscriber.next({
            data: JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Stream error",
            }),
          })

          subscriber.error(error)
        }
      }

      processStream()
    })
  }
}
