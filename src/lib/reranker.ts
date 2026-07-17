/** Dedicated reranker with an LLM-scoring fallback. */

import OpenAI from 'openai'
import { wrapOpenAI } from 'langsmith/wrappers/openai'
import { logger } from './logger'
import { LLM_CONFIG, DEFAULT_LLM_RERANKER_MODEL, DEFAULT_RERANKER_MODEL } from './llm-config'

export interface RerankerOptions {
  enabled?: boolean
  /** 最终保留数量，默认 5 */
  topK?: number
  /** 使用的模型，默认 qwen/qwen3-8b */
  model?: string
  provider?: 'dedicated' | 'llm'
  fallbackModel?: string
}

interface RerankCandidate {
  id: string
  title: string
  content: string
  similarity: number
}

const DEFAULT_MODEL = DEFAULT_RERANKER_MODEL

const openai = wrapOpenAI(new OpenAI({
  apiKey: LLM_CONFIG.apiKey,
  baseURL: LLM_CONFIG.baseURL,
}))

/**
 * 构建 reranker 提示词
 * 要求 LLM 对每个候选文档的 relevance 打分 (0-10)
 */
function buildPrompt(query: string, documents: RerankCandidate[]): string {
  return `你是一个文档相关性评估专家。请判断以下文档与用户问题的相关程度。

用户问题: "${query}"

请为每个文档的 relevance 打分（0-10分）：
- 0 = 完全不相关
- 5 = 部分相关
- 10 = 高度相关，直接回答用户问题

打分标准：
- 文档是否直接包含了用户问题的答案？
- 文档是否提供了解决用户问题的关键信息？
- 文档中的信息是否准确且有用？

只返回一个 JSON 对象，格式如下（不要包含其他文字）：
{"scores": [{"index": 0, "relevance": 8, "reason": "简短理由"}, ...]}

---
${documents.map((doc, i) => `[${i}] ${doc.title}
${doc.content.slice(0, 300)}`).join('\n\n')}`
}

interface DedicatedRerankResponse {
  results?: Array<{
    index: number
    relevance_score: number
  }>
}

function applyScores<T extends RerankCandidate>(
  candidates: T[],
  scores: Array<{ index: number; score: number }>,
  topK: number,
) {
  const scoreMap = new Map(scores.map((score) => [score.index, score.score]))
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      similarity: scoreMap.get(index) ?? candidate.similarity,
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK)
}

async function rerankWithDedicatedModel<T extends RerankCandidate>(
  query: string,
  candidates: T[],
  topK: number,
  model: string,
) {
  const response = await fetch(`${LLM_CONFIG.baseURL.replace(/\/$/, '')}/rerank`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LLM_CONFIG.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      query,
      documents: candidates.map((candidate) => `${candidate.title}\n${candidate.content}`),
      top_n: topK,
      return_documents: false,
    }),
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) {
    throw new Error(`Dedicated reranker returned ${response.status}`)
  }

  const payload = await response.json() as DedicatedRerankResponse
  if (!payload.results?.length) throw new Error('Dedicated reranker returned no results')

  return applyScores(
    candidates,
    payload.results.map((result) => ({ index: result.index, score: result.relevance_score })),
    topK,
  )
}

async function rerankWithLlm<T extends RerankCandidate>(
  query: string,
  candidates: T[],
  topK: number,
  model: string,
) {
  const prompt = buildPrompt(query, candidates)
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  }, {
    langsmithExtra: {
      tags: ['reranker', 'rag'],
      metadata: { candidateCount: candidates.length, provider: 'llm-fallback' },
    },
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('LLM reranker returned an empty response')

  const parsed = JSON.parse(content)
  const scores: Array<{ index: number; relevance: number }> = parsed.scores ?? parsed
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new Error('LLM reranker returned invalid scores')
  }

  return applyScores(
    candidates,
    scores.map((score) => ({ index: score.index, score: score.relevance / 10 })),
    topK,
  )
}

/**
 * 对候选文档进行 LLM 重排序
 *
 * @param query 原始用户查询
 * @param candidates 候选文档列表（已按 RRF 排序）
 * @param options 重排序选项
 * @returns 重新排序后的文档列表
 */
export async function rerankResults<T extends RerankCandidate>(
  query: string,
  candidates: T[],
  options: RerankerOptions = {},
): Promise<T[]> {
  const {
    topK = 5,
    model = DEFAULT_MODEL,
    provider = 'dedicated',
    fallbackModel = DEFAULT_LLM_RERANKER_MODEL,
  } = options

  // 候选数 <= 目标数，不需要重排序
  if (candidates.length <= topK) {
    return candidates.slice(0, topK)
  }

  logger.info('RAG.Reranker.Start', { candidates: candidates.length, topK, model, provider })

  try {
    let final: T[]
    if (provider === 'llm') {
      final = await rerankWithLlm(query, candidates, topK, fallbackModel)
    } else {
      try {
        final = await rerankWithDedicatedModel(query, candidates, topK, model)
      } catch (dedicatedError) {
        logger.warn('RAG.Reranker.DedicatedFallback', { error: String(dedicatedError) })
        final = await rerankWithLlm(query, candidates, topK, fallbackModel)
      }
    }

    logger.info('RAG.Reranker.Result', {
      count: final.length,
      topScore: final[0].similarity.toFixed(3),
      topTitle: final[0].title,
      results: final.map((r, i) => ({
        rank: i + 1,
        title: r.title,
        score: Number(r.similarity.toFixed(3)),
      })),
    })

    return final
  } catch (error) {
    logger.error('RAG.Reranker.Error', { error: String(error) })
    return candidates.slice(0, topK)
  }
}
