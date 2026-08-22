import { Injectable, Logger, MessageEvent } from "@nestjs/common"
import { Observable } from "rxjs"
import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { wrapOpenAI } from "langsmith/wrappers/openai"
import type { ChatRequest, RAGCitation } from "@ai-arg/contracts"
import { PrismaService } from "../database/prisma.service"
import { RetrievalService } from "../retrieval/retrieval.service"
import { LLM_CONFIG, resolveModelCandidates } from "./llm-config"

const LANGSMITH_ENABLED = Boolean(process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY)

// Must stay byte-identical to web's message: the SSE protocol is frozen and
// this string is user-visible (apps/web/src/app/api/chat/route.web.ts).
const STREAM_ERROR_MESSAGE = "模型流式响应中断，请稍后重试"

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private readonly openai: OpenAI

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
  ) {
    if (!LLM_CONFIG.apiKey) {
      throw new Error("SILICONFLOW_API_KEY or OPENROUTER_API_KEY is required")
    }

    const client = new OpenAI({
      apiKey: LLM_CONFIG.apiKey,
      baseURL: LLM_CONFIG.baseURL,
    })

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

          const { ragContext, citations, ragDecision, ragAbstainReason } =
            await this.retrieveContext(userId, request)

          const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))

          if (ragContext) {
            messages.unshift({
              role: "system",
              content: `参考以下知识库内容回答用户问题：\n\n${ragContext}`,
            })
          }

          // web tries each configured model in turn so one unavailable model
          // does not fail the request; mirror that rather than pinning one.
          const { stream, model } = await this.openStreamWithFallback(messages, {
            userId,
            conversationId,
            requestId,
            useRAG: request.useRAG,
            citationCount: citations.length,
          })

          // metadata goes first: ChatPanel reads requestId and citations from it
          // before any text arrives. Emitting it after the deltas would leave the
          // client without them for the whole answer.
          subscriber.next({
            data: JSON.stringify({
              type: "metadata",
              requestId,
              model,
              citations,
              ...(ragDecision && { ragDecision }),
              ...(ragAbstainReason && { ragAbstainReason }),
            }),
          })

          let assistantContent = ""

          for await (const rawChunk of stream) {
            const chunk = rawChunk as { choices?: Array<{ delta?: { content?: unknown } }> }
            const content = chunk.choices?.[0]?.delta?.content
            if (typeof content !== "string" || content.length === 0) continue

            assistantContent += content
            // Forward the provider chunk as-is with the resolved model, matching
            // web's wire format: ChatPanel reads choices[0].delta.content.
            subscriber.next({
              data: JSON.stringify({ ...chunk, model }),
            })
          }

          await this.prisma.openRouterChat.create({
            data: {
              userId,
              conversationId,
              role: "assistant",
              content: assistantContent,
              model,
            },
          })

          this.logger.log({
            event: "Chat.Completed",
            requestId,
            userId,
            model,
            citationCount: citations.length,
            contentLength: assistantContent.length,
          })

          // web terminates every stream with this sentinel; the protocol is
          // frozen, so emit it on the success path too.
          subscriber.next({ data: "[DONE]" })
          subscriber.complete()
        } catch (error) {
          // Log the real cause, but send the client the same fixed message web
          // sends. Forwarding error.message would both change the user-visible
          // string and risk leaking internals (spec 005, Data And Security).
          this.logger.error({
            event: "Chat.Error",
            requestId,
            userId,
            error: error instanceof Error ? error.message : String(error),
          })

          subscriber.next({
            data: JSON.stringify({
              type: "error",
              error: STREAM_ERROR_MESSAGE,
            }),
          })

          subscriber.next({ data: "[DONE]" })
          subscriber.complete()
        }
      }

      void processStream()
    })
  }

  private async retrieveContext(userId: string, request: ChatRequest) {
    const citations: RAGCitation[] = []
    let ragContext = ""
    let ragDecision: "ANSWER" | "ABSTAIN" | undefined
    let ragAbstainReason: string | undefined

    const userMessage = request.messages[request.messages.length - 1]
    if (!request.useRAG || !userMessage?.content) {
      return { ragContext, citations, ragDecision, ragAbstainReason }
    }

    try {
      const searchResult = await this.retrieval.hybridSearch(userId, {
        query: userMessage.content,
        topK: 5,
        minSimilarity: 0.5,
      })

      ragDecision = searchResult.decision.outcome

      if (searchResult.decision.outcome === "ANSWER" && searchResult.documents.length > 0) {
        ragContext = searchResult.documents
          .map((doc, index) => `【引用${index + 1}】${doc.title}\n${doc.content}`)
          .join("\n\n")

        citations.push(
          ...searchResult.documents.map((doc, index) => ({
            citationId: `${index + 1}`,
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
    }

    return { ragContext, citations, ragDecision, ragAbstainReason }
  }

  private async openStreamWithFallback(
    messages: OpenAI.ChatCompletionMessageParam[],
    langsmithMetadata: Record<string, unknown>,
  ) {
    const candidates = resolveModelCandidates()
    const failures: Array<{ model: string; message: string }> = []

    for (const model of candidates) {
      const params: OpenAI.ChatCompletionCreateParamsStreaming = {
        model,
        messages,
        stream: true,
      }

      if (LANGSMITH_ENABLED) {
        // langsmithExtra is injected by wrapOpenAI and is not part of the
        // OpenAI request type, so it has to be attached outside the typed shape.
        Object.assign(params, { langsmithExtra: { metadata: langsmithMetadata } })
      }

      try {
        const stream = await this.openai.chat.completions.create(params)
        return { stream, model }
      } catch (error) {
        // Bad credentials will fail identically for every candidate, so stop
        // rather than retrying the same rejection N times.
        if (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403)) {
          throw error
        }

        const message = error instanceof Error ? error.message : String(error)
        failures.push({ model, message })
        this.logger.warn({ event: "Chat.ModelFailed", model, message })
      }
    }

    throw new Error(`All models failed: ${failures.map((f) => `${f.model} (${f.message})`).join("; ")}`)
  }
}
