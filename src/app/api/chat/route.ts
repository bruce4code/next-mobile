import OpenAI from "openai"
import { getUser } from '@/app/auth/server'
import { searchSimilarDocuments, buildRAGContext } from '@/lib/rag'

// 初始化 OpenRouter 客户端
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseURL: "https://openrouter.ai/api/v1",
})

const DEFAULT_MODEL_CANDIDATES = [
  "stepfun/step-3.5-flash",
  "nvidia/nemotron-3-super",
  "arcee-ai/trinity-large-preview",
  "z-ai/glm-4.5-air",
]

const ENABLE_RAG = true

type SSETransformOptions = {
  attemptedModel: string
}

interface Message {
  role: string
  content: string
}

function createSseTransform({ attemptedModel }: SSETransformOptions) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new TransformStream<Uint8Array, Uint8Array>({
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
  const configured = process.env.OPENROUTER_MODEL
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
    const status = error.status ?? error.statusCode
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
  let body: { messages?: unknown; useRAG?: boolean }

  try {
    body = await req.json()
  } catch (error) {
    console.error("解析请求体失败:", error)
    return new Response(
      JSON.stringify({ error: "请求体不是合法的 JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const { messages, useRAG = true } = body

  if (!Array.isArray(messages)) {
    return new Response(
      JSON.stringify({ error: "messages 字段必须是数组" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  let enhancedMessages = messages as Message[]

  console.log('🔍 Chat API 被调用')
  console.log('  - ENABLE_RAG:', ENABLE_RAG)
  console.log('  - useRAG:', useRAG)
  console.log('  - messages 数量:', messages.length)

  if (ENABLE_RAG && useRAG) {
    try {
      console.log('✅ 进入 RAG 流程')
      
      const lastUserMessage = [...enhancedMessages].reverse().find(
        (msg) => msg.role === 'user'
      )
      console.log('  - lastUserMessage:', lastUserMessage ? '找到' : '未找到')

      if (lastUserMessage?.content) {
        console.log('🧠 使用 RAG 搜索相关文档, 查询:', lastUserMessage.content.substring(0, 100) + '...')
        
        try {
          const similarDocs = await searchSimilarDocuments(
            lastUserMessage.content,
            { topK: 5 }
          )

          if (similarDocs.length > 0) {
            console.log(`✅ 找到 ${similarDocs.length} 个相关文档:`)
            similarDocs.forEach((doc, index) => {
              const similarity = doc.similarity ? ` (相似度: ${(doc.similarity * 100).toFixed(1)}%)` : ''
              console.log(`  ${index + 1}. ${doc.title}${similarity}`)
            })
            
            const ragContext = buildRAGContext(similarDocs)

            enhancedMessages = [
              { role: 'system', content: ragContext },
              ...messages,
            ]
            
            console.log('📚 RAG 上下文已添加到对话中')
          } else {
            console.log('❌ 没有找到相关文档，使用普通对话模式')
          }
        } catch (searchError) {
          console.warn('⚠️ RAG 搜索出错（可能是网络问题），跳过 RAG:', searchError)
        }
      }
    } catch (ragError) {
      console.error('❌ RAG 流程失败，回退到普通对话:', ragError)
    }
  } else {
    console.log('❌ RAG 未启用，使用普通对话模式')
  }

  const modelsToTry = resolveModelCandidates()
  const errors: Array<{ model: string; message: string }> = []

  for (const model of modelsToTry) {
    try {
      console.log("请求 OpenRouter 模型:", model)
      const response = await openai.chat.completions.create({
        model,
        messages: enhancedMessages,
        stream: true,
      })

      const responseStream = response
        .toReadableStream()
        .pipeThrough(createSseTransform({ attemptedModel: model }))

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-OpenRouter-Model": model,
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
