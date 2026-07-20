import OpenAI from "openai"
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

// 初始化 LLM 客户端，并用 wrapOpenAI 启用 LangSmith 自动追踪
const openai = wrapOpenAI(new OpenAI({
  apiKey: LLM_CONFIG.apiKey,
  baseURL: LLM_CONFIG.baseURL,
}))

const DEFAULT_MODEL_CANDIDATES = DEFAULT_CHAT_MODELS

const ENABLE_RAG = true
const ENABLE_NEST_RETRIEVAL_SHADOW = process.env.RAG_SHADOW_NEST === 'true'

async function shadowNestRetrieval(query: string, userId: string, legacyDocumentIds: string[]) {
  const accessToken = await getAccessToken()
  const baseURL = process.env.NEST_API_URL
  if (!accessToken || !baseURL) return

  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/api/retrieval/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, topK: 5 }),
      cache: 'no-store',
    })
    if (!response.ok) {
      console.warn('Nest retrieval shadow failed', { userId, status: response.status })
      return
    }

    const payload = await response.json() as { documents?: Array<{ documentId: string }> }
    const nestDocumentIds = payload.documents?.map((document) => document.documentId) ?? []
    const overlap = legacyDocumentIds.filter((id) => nestDocumentIds.includes(id)).length
    console.info('Nest retrieval shadow comparison', {
      userId,
      legacyCount: legacyDocumentIds.length,
      nestCount: nestDocumentIds.length,
      overlap,
    })
  } catch (error) {
    console.warn('Nest retrieval shadow errored', { userId, error: String(error) })
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

function createSseTransform({ attemptedModel, requestId, citations }: SSETransformOptions) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new TransformStream<Uint8Array, Uint8Array>({
    async start(controller) {
      // 发送初始 metadata 事件（含 requestId，供前端反馈使用）
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'metadata',
        requestId,
        model: attemptedModel,
        citations,
      })}\n\n`))
    },
    async transform(chunk, controller) {
      const text = decoder.decode(chunk)

      for (const rawLine of text.split("\n")) {
        const line = rawLine.trim()
        if (!line) continue

        // OpenRouter 会发送以 "data:" 开头的 SSE 帧
        const payload = line.startsWith("data:") ? line.slice(5).trim() : line

        if (payload === "[DONE]") {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          continue
        }

        try {
          const jsonData = JSON.parse(payload)
          if (jsonData.choices?.[0]?.delta?.content) {
            const enriched = {
              ...jsonData,
              model: attemptedModel,
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(enriched)}\n\n`),
            )
          }
        } catch (error) {
          console.error("解析 JSON 失败:", error, payload)
        }
      }
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
          const retrieval = await searchRagRetrievalDecision(
            retrievalQuery,
            { userId, topK: 5, mode: 'hybrid', reranker: { topK: 5 } }
          )
          const similarDocs = retrieval.documents
          ragDecision = retrieval.decision

          if (retrieval.decision.outcome === 'ANSWER') {
            similarDocsCount = similarDocs.length
            citations = toRAGCitations(similarDocs)
            if (ENABLE_NEST_RETRIEVAL_SHADOW) {
              void shadowNestRetrieval(retrievalQuery, userId, similarDocs.map((document) => document.documentId))
            }
            console.log(`✅ 找到 ${similarDocs.length} 个相关文档:`)
            similarDocs.forEach((doc, index) => {
              const similarity = doc.similarity ? ` (相似度: ${(doc.similarity * 100).toFixed(1)}%)` : ''
              console.log(`  ${index + 1}. 已检索文档${similarity}`)
            })
            
            const ragContext = buildRAGContext(similarDocs)

            const lastUserIndex = messages.findLastIndex(
              (msg) => msg.role === 'user'
            )
            if (lastUserIndex >= 0) {
              enhancedMessages = [
                ...messages.slice(0, lastUserIndex),
                { role: 'system', content: ragContext },
                ...messages.slice(lastUserIndex),
              ]
            } else {
              enhancedMessages = [
                { role: 'system', content: ragContext },
                ...messages,
              ]
            }
            
            console.log('📚 RAG 上下文已添加到对话中（位置：用户消息之前）')
          } else {
            console.info('RAG abstention decision', {
              requestId,
              backend: 'legacy',
              reason: retrieval.decision.reason,
              mode: abstentionMode,
            })
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

      const responseStream = response
        .toReadableStream()
        .pipeThrough(createSseTransform({ attemptedModel: model, requestId, citations }))

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
