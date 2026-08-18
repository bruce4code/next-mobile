import { Injectable, Logger, MessageEvent } from "@nestjs/common"
import { Observable } from "rxjs"
import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { wrapOpenAI } from "langsmith/wrappers/openai"
import type { ChatRequest } from "@ai-arg/contracts"
import { PrismaService } from "../database/prisma.service"
import { RetrievalService } from "../retrieval/retrieval.service"

const DEFAULT_MODEL = "openai/gpt-4o-mini"
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const LANGSMITH_ENABLED = Boolean(process.env.LANGCHAIN_API_KEY)

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

    const client = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    })

    // Wrap with LangSmith if enabled
    this.openai = LANGSMITH_ENABLED ? wrapOpenAI(client) : client
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
          let ragDecision: "ANSWER" | "ABSTAIN" | undefined
          let ragAbstainReason: "NO_CANDIDATES" | "RERANK_UNAVAILABLE" | "LOW_TOP_SCORE" | "AMBIGUOUS_TOP_RESULT" | undefined
          const citations: Array<{
            citationId: string
            documentId: string
            chunkId: string
            title: string
            heading?: string
            sourceName?: string
            sourceUri?: string
            sourceVersion: number
            startOffset?: number
            endOffset?: number
            score: number
          }> = []

          if (request.useRAG && userMessage.content) {
            try {
              const searchResult = await this.retrieval.hybridSearch(userId, {
                query: userMessage.content,
                topK: 5,
                minSimilarity: 0.5,
              })

              ragDecision = searchResult.decision.outcome

              if (searchResult.decision.outcome === "ANSWER" && searchResult.documents.length > 0) {
                ragContext = searchResult.documents
                  .map((doc, idx) => `【引用${idx + 1}】${doc.title}\n${doc.content}`)
                  .join("\n\n")

                // Extract citations
                citations.push(
                  ...searchResult.documents.map((doc, idx) => ({
                    citationId: `${idx + 1}`,
                    documentId: doc.documentId,
                    chunkId: doc.id,
                    title: doc.title,
                    heading: doc.heading,
                    sourceName: doc.sourceName,
                    sourceUri: doc.sourceUri,
                    sourceVersion: doc.sourceVersion,
                    startOffset: doc.startOffset,
                    endOffset: doc.endOffset,
                    score: doc.similarity,
                  })),
                )
              } else if (searchResult.decision.outcome === "ABSTAIN") {
                ragAbstainReason = searchResult.decision.reason
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
          const streamParams: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: DEFAULT_MODEL,
            messages,
            stream: true,
          }

          // Add LangSmith metadata if enabled
          if (LANGSMITH_ENABLED) {
            ;(streamParams as any).langsmithExtra = {
              metadata: {
                userId,
                conversationId,
                requestId,
                useRAG: request.useRAG,
                citationCount: citations.length,
              },
            }
          }

          const stream = await this.openai.chat.completions.create(streamParams)

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
              ragDecision,
              ragAbstainReason,
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
