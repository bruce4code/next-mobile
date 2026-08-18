import OpenAI from "openai"
import { createHash } from "crypto"
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { wrapOpenAI } from 'langsmith/wrappers/openai'
import { getAccessToken, getUser } from '@/app/auth/server'
import {
  searchRagRetrievalDecision,
  buildRAGContext,
  extractKeywords,
  rewriteRetrievalQuery,
  toRAGCitations,
  type RAGCitation,
} from '@/lib/rag'
import { getRagAbstentionMode, RAG_ABSTENTION_MESSAGE, type RagDecision } from '@/lib/rag-abstention'
import {
  LLM_CONFIG,
  DEFAULT_CHAT_MODELS,
} from '@/lib/llm-config'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// 初始化 LLM 客户端，并用 wrapOpenAI 启用 LangSmith 自动追踪
const openai = wrapOpenAI(new OpenAI({
  apiKey: LLM_CONFIG.apiKey,
  baseURL: LLM_CONFIG.baseURL,
}))

const DEFAULT_MODEL_CANDIDATES = DEFAULT_CHAT_MODELS

const ENABLE_RAG = true
type RagBackend = 'legacy' | 'shadow' | 'nest'

type NestRetrievalDecision =
  | { outcome: 'ANSWER' }
  | { outcome: 'ABSTAIN'; reason: 'NO_CANDIDATES' | 'RERANK_UNAVAILABLE' | 'LOW_TOP_SCORE' | 'AMBIGUOUS_TOP_RESULT' }

type NestRetrievalResponse = {
  documents: Array<{ documentId: string }>
  citations: RAGCitation[]
  context: string
  decision?: NestRetrievalDecision
}

function resolveRagBackend(userId: string, email: string | null | undefined): RagBackend {
  const configured = process.env.RAG_BACKEND
  if (configured === 'legacy' || configured === 'shadow') return configured
  if (configured === 'nest') {
    const internalUsers = (process.env.RAG_NEST_INTERNAL_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (isAdminEmail(email) || internalUsers.includes(userId)) return 'nest'
    console.info('Nest retrieval is not enabled for this user; using legacy retrieval', { userId })
    return 'legacy'
  }
  if (!configured && process.env.RAG_SHADOW_NEST === 'true') return 'shadow'
  if (configured) console.warn('Unknown RAG_BACKEND; using legacy retrieval', { configured })
  return 'legacy'
}

function nestTimeoutMs() {
  const configured = Number(process.env.RAG_NEST_TIMEOUT_MS ?? 3500)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 100), 8000) : 3500
}

function isValidNestDecision(decision: unknown): decision is NestRetrievalDecision {
  if (typeof decision !== 'object' || decision === null) return false
  const candidate = decision as { outcome?: unknown; reason?: unknown }
  if (candidate.outcome === 'ANSWER') return true
  if (candidate.outcome === 'ABSTAIN') {
    return candidate.reason === 'NO_CANDIDATES'
      || candidate.reason === 'RERANK_UNAVAILABLE'
      || candidate.reason === 'LOW_TOP_SCORE'
      || candidate.reason === 'AMBIGUOUS_TOP_RESULT'
  }
  return false
}

async function requestNestRetrieval(query: string): Promise<NestRetrievalResponse> {
  const accessToken = await getAccessToken()
  const baseURL = process.env.NEST_API_URL
  if (!accessToken || !baseURL) throw new Error('Nest endpoint or access token unavailable')

  const response = await fetch(`${baseURL.replace(/\/$/, '')}/api/retrieval/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, topK: 5 }),
    cache: 'no-store',
    signal: AbortSignal.timeout(nestTimeoutMs()),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const payload = await response.json() as Partial<NestRetrievalResponse>
  if (!Array.isArray(payload.documents) || !Array.isArray(payload.citations) || typeof payload.context !== 'string') {
    throw new Error('Nest retrieval returned an invalid response')
  }
  if (payload.decision !== undefined && !isValidNestDecision(payload.decision)) {
    throw new Error('Nest retrieval returned an invalid decision')
  }

  return payload as NestRetrievalResponse
}

async function shadowNestRetrieval(query: string, userId: string, legacyDocumentIds: string[]) {
  const queryHash = createHash('sha256').update(query).digest('hex')
  const startedAt = Date.now()

  try {
    const payload = await requestNestRetrieval(query)
    const nestDocumentIds = payload.documents.map((document) => document.documentId)
    const overlap = legacyDocumentIds.filter((id) => nestDocumentIds.includes(id)).length
    await prisma.ragShadowComparison.create({ data: { userId, queryHash, legacyDocumentIds, nestDocumentIds, legacyCount: legacyDocumentIds.length, nestCount: nestDocumentIds.length, overlap, latencyMs: Date.now() - startedAt, status: 'COMPLETED' } })
    console.info('Nest retrieval shadow comparison', {
      userId,
      legacyCount: legacyDocumentIds.length,
      nestCount: nestDocumentIds.length,
      overlap,
    })
  } catch (error) {
    console.warn('Nest retrieval shadow errored', { userId, error: String(error) })
    const errorMessage = String(error)
    const status = errorMessage === 'Nest endpoint or access token unavailable' ? 'SKIPPED' : 'FAILED'
    await prisma.ragShadowComparison.create({ data: { userId, queryHash, legacyDocumentIds, nestDocumentIds: [], legacyCount: legacyDocumentIds.length, nestCount: 0, overlap: 0, latencyMs: Date.now() - startedAt, status, error: errorMessage.slice(0, 500) } }).catch(() => undefined)
  }
}

type SSETransformOptions = {
  attemptedModel: string
  requestId: string
  citations: RAGCitation[]
}

function createAbstentionResponse(requestId: string, reason: string) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'metadata',
        requestId,
        model: 'rag-abstention',
        citations: [],
        ragDecision: 'ABSTAIN',
        ragAbstainReason: reason,
      })}\n\n`))
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        choices: [{ delta: { content: RAG_ABSTENTION_MESSAGE } }],
        model: 'rag-abstention',
      })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    },
  })
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(12_000),
  })).min(1).max(30),
  useRAG: z.boolean().optional().default(true),
}).superRefine(({ messages }, context) => {
  const totalCharacters = messages.reduce((total, message) => total + message.content.length, 0)
  if (totalCharacters > 100_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '消息总长度不能超过 100000 个字符' })
  }
})

function createSseStream(
  stream: AsyncIterable<unknown>,
  { attemptedModel, requestId, citations }: SSETransformOptions,
) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'metadata',
        requestId,
        model: attemptedModel,
        citations,
      })}\n\n`))

      void (async () => {
        try {
          for await (const rawChunk of stream) {
            const chunk = rawChunk as { choices?: Array<{ delta?: { content?: unknown } }> }
            const content = chunk.choices?.[0]?.delta?.content
            if (typeof content !== 'string' || content.length === 0) continue

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              ...chunk,
              model: attemptedModel,
            })}\n\n`))
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('OpenRouter stream failed:', error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: '模型流式响应中断，请稍后重试',
          })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })()
    },
  })
}

function resolveModelCandidates() {
  const modelStr = process.env.LLM_MODEL || process.env.OPENROUTER_MODEL
  const configured = modelStr
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean)

  if (configured && configured.length > 0) {
    return configured
  }

  return DEFAULT_MODEL_CANDIDATES
}

function isAuthOrKeyError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    const status = error.status
    return status === 401 || status === 403
  }

  if (typeof error === "object" && error !== null) {
    const maybeStatus = (error as { status?: number }).status
    if (maybeStatus === 401 || maybeStatus === 403) {
      return true
    }
  }

  return false
}

export async function POST(req: Request) {
  let body: unknown

  try {
    body = await req.json()
  } catch (error) {
    console.error("解析请求体失败:", error)
    return new Response(
      JSON.stringify({ error: "请求体不是合法的 JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const parsed = ChatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: '请求参数校验失败', details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const { messages, useRAG } = parsed.data
  const user = await getUser()
  if (!user) {
    return new Response(
      JSON.stringify({ error: '未登录' }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )
  }

  let enhancedMessages: Message[] = messages

  // LangSmith metadata：用于在 Dashboard 按用户/请求筛选 trace
  const userId = user.id
  const requestId = crypto.randomUUID()
  const ragBackend = resolveRagBackend(userId, user.email)
  const abstentionMode = getRagAbstentionMode()
  let similarDocsCount = 0
  let citations: RAGCitation[] = []
  let ragDecision: RagDecision | null = null
  console.log('🔍 Chat API 被调用')
  console.log('  - ENABLE_RAG:', ENABLE_RAG)
  console.log('  - useRAG:', useRAG)
  console.log('  - messages 数量:', messages.length)
  console.log('  - userId:', userId)
  console.log('  - requestId:', requestId)
  console.log('  - RAG backend:', ragBackend)

  if (ENABLE_RAG && useRAG) {
    try {
      console.log('✅ 进入 RAG 流程')
      
      const lastUserMessage = [...enhancedMessages].reverse().find(
        (msg) => msg.role === 'user'
      )
      console.log('  - lastUserMessage:', lastUserMessage ? '找到' : '未找到')

      if (lastUserMessage?.content) {
        const retrievalQuery = rewriteRetrievalQuery(enhancedMessages)
        console.log('🧠 使用 RAG 搜索相关文档, 查询长度:', retrievalQuery.length)
        
        // 闲聊/问候语检测：无有效关键词时跳过 RAG
        const keywords = extractKeywords(retrievalQuery)
        console.log('  - 提取到的关键词数量:', keywords.length)
        if (keywords.length > 0) {
          try {
            let ragContext = ''
            let nestResponseReceived = false

            if (ragBackend === 'nest') {
              try {
                const nestResult = await requestNestRetrieval(retrievalQuery)
                nestResponseReceived = true
                if (nestResult.decision) {
                  ragDecision = nestResult.decision
                }
                if (nestResult.decision?.outcome === 'ANSWER') {
                  similarDocsCount = nestResult.documents.length
                  citations = nestResult.citations
                  ragContext = nestResult.context
                  console.log(`✅ Nest 检索到 ${similarDocsCount} 个相关文档`)
                } else {
                  console.info('RAG abstention decision', {
                    requestId,
                    backend: 'nest',
                    reason: nestResult.decision?.reason ?? 'NO_CANDIDATES',
                    mode: abstentionMode,
                  })
                }
              } catch (nestError) {
                console.warn('⚠️ Nest RAG 检索失败，回退到 legacy:', nestError)
              }
            }

            if (ragBackend !== 'nest' || !nestResponseReceived) {
              const retrieval = await searchRagRetrievalDecision(
                retrievalQuery,
                { userId, topK: 5, mode: 'hybrid', reranker: { topK: 5 } },
              )
              const similarDocs = retrieval.documents
              ragDecision = retrieval.decision

              if (ragBackend === 'shadow') {
                void shadowNestRetrieval(retrievalQuery, userId, similarDocs.map((document) => document.documentId))
              }

              if (retrieval.decision.outcome === 'ANSWER') {
                similarDocsCount = similarDocs.length
                citations = toRAGCitations(similarDocs)
                ragContext = buildRAGContext(similarDocs)
                console.log(`✅ Legacy 检索到 ${similarDocs.length} 个相关文档`)
              } else {
                console.info('RAG abstention decision', {
                  requestId,
                  backend: 'legacy',
                  reason: retrieval.decision.reason,
                  mode: abstentionMode,
                })
              }
            }

            // 兼容未返回 decision 的旧版 Nest：保留 NO_CANDIDATES 兜底
            if (!ragContext && ragBackend === 'nest' && nestResponseReceived && ragDecision === null) {
              ragDecision = { outcome: 'ABSTAIN', reason: 'NO_CANDIDATES' }
            }

            if (ragContext) {
              const lastUserIndex = messages.findLastIndex((msg) => msg.role === 'user')
              enhancedMessages = lastUserIndex >= 0
                ? [...messages.slice(0, lastUserIndex), { role: 'system', content: ragContext }, ...messages.slice(lastUserIndex)]
                : [{ role: 'system', content: ragContext }, ...messages]
              console.log('📚 RAG 上下文已添加到对话中（位置：用户消息之前）')
            } else {
              console.log('❌ 没有找到相关文档，使用普通对话模式')
            }
          } catch (searchError) {
            console.warn('⚠️ RAG 搜索出错（可能是网络问题），跳过 RAG:', searchError)
            ragDecision = { outcome: 'ABSTAIN', reason: 'RERANK_UNAVAILABLE' }
          }
        }
      }
    } catch (ragError) {
      console.error('❌ RAG 流程失败，回退到普通对话:', ragError)
    }
  } else {
    console.log('❌ RAG 未启用，使用普通对话模式')
  }

  if (ragDecision?.outcome === 'ABSTAIN' && abstentionMode === 'enforce') {
    return createAbstentionResponse(requestId, ragDecision.reason)
  }

  const modelsToTry = resolveModelCandidates()
  const errors: Array<{ model: string; message: string }> = []

  for (const model of modelsToTry) {
    try {
      console.log("请求 OpenRouter 模型:", model)
      const response = await openai.chat.completions.create({
        model,
        messages: enhancedMessages as ChatCompletionMessageParam[],
        stream: true,
      }, {
        langsmithExtra: {
          metadata: {
            userId,
            requestId,
            modelName: model,
            isRAG: ENABLE_RAG && useRAG && similarDocsCount > 0,
            ragDocCount: similarDocsCount,
            citationIds: citations.map((citation) => citation.citationId),
            messageCount: messages.length,
            environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
          },
          tags: ['production', 'chat', ENABLE_RAG && useRAG ? 'rag' : 'no-rag'],
        },
      })

      const responseStream = createSseStream(response, { attemptedModel: model, requestId, citations })

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-OpenRouter-Model": model,
          "X-Request-Id": requestId,
        },
      })
    } catch (error) {
      console.error(`模型 ${model} 调用失败:`, error)

      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown error"

      errors.push({ model, message })

      if (isAuthOrKeyError(error)) {
        break
      }
    }
  }

  const responseBody = {
    error: "处理您的请求时出错",
    attempts: errors,
  }

  return new Response(JSON.stringify(responseBody), {
    status: errors.some(({ message }) => /rate limit/i.test(message)) ? 429 : 502,
    headers: { "Content-Type": "application/json" },
  })
}
