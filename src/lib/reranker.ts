/**
 * LLM-based Reranker
 *
 * 对 RRF 融合后的 top-N 候选结果，用 LLM 做精排。
 * 通过单次 API 调用对多个文档批量评分，返回重新排序后的结果。
 *
 * 适用场景：当 top-K 候选数 > 最终需要的数量时，用 LLM 提升精度。
 * 注意事项：会增加 ~200ms 延迟和少量 token 消耗，默认关闭，
 * 可通过环境变量 RERANKER_ENABLED=true 开启。
 */

import OpenAI from 'openai'
import { logger } from './logger'
import { OPENROUTER_CONFIG, DEFAULT_RERANKER_MODEL } from './openrouter'

export interface RerankerOptions {
  enabled?: boolean
  /** 最终保留数量，默认 5 */
  topK?: number
  /** 使用的模型，默认 qwen/qwen3-8b */
  model?: string
}

interface DocumentInput {
  id: string
  title: string
  content: string
  similarity: number
  [key: string]: unknown
}

// 默认模型：轻量且对中文理解好
const DEFAULT_MODEL = DEFAULT_RERANKER_MODEL

const openai = new OpenAI({
  apiKey: OPENROUTER_CONFIG.apiKey,
  baseURL: OPENROUTER_CONFIG.baseURL,
})

/**
 * 构建 reranker 提示词
 * 要求 LLM 对每个候选文档的 relevance 打分 (0-10)
 */
function buildPrompt(query: string, documents: DocumentInput[]): string {
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

/**
 * 对候选文档进行 LLM 重排序
 *
 * @param query 原始用户查询
 * @param candidates 候选文档列表（已按 RRF 排序）
 * @param options 重排序选项
 * @returns 重新排序后的文档列表
 */
export async function rerankResults(
  query: string,
  candidates: DocumentInput[],
  options: RerankerOptions = {},
): Promise<DocumentInput[]> {
  const { topK = 5, model = DEFAULT_MODEL } = options

  // 候选数 <= 目标数，不需要重排序
  if (candidates.length <= topK) {
    return candidates.slice(0, topK)
  }

  logger.info('RAG.Reranker.Start', { candidates: candidates.length, topK, model })

  try {
    const prompt = buildPrompt(query, candidates)

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      logger.warn('RAG.Reranker.EmptyResponse', 'LLM 返回为空，跳过重排序')
      return candidates.slice(0, topK)
    }

    // 解析 JSON 响应
    const parsed = JSON.parse(content)
    const scores: Array<{ index: number; relevance: number }> = parsed.scores ?? parsed

    if (!Array.isArray(scores) || scores.length === 0) {
      logger.warn('RAG.Reranker.InvalidJSON', { raw: content.slice(0, 100) })
      return candidates.slice(0, topK)
    }

    logger.info('RAG.Reranker.Scored', {
      scores: scores.map(s => ({ index: s.index, relevance: s.relevance })),
    })

    // 创建 index → score 映射
    const relevanceMap = new Map<number, number>()
    for (const s of scores) {
      relevanceMap.set(s.index, s.relevance)
    }

    // 按 relevance 降序排列
    const reordered = candidates
      .map((doc, i) => ({
        ...doc,
        similarity: relevanceMap.get(i) !== undefined
          ? (relevanceMap.get(i)! / 10)  // 归一化到 [0, 1]
          : doc.similarity,
      }))
      .sort((a, b) => b.similarity - a.similarity)

    const final = reordered.slice(0, topK)
    logger.info('RAG.Reranker.Result', {
      count: final.length,
      topScore: final[0].similarity.toFixed(3),
      topTitle: final[0].title,
      results: final.map((r, i) => ({
        rank: i + 1,
        title: r.title,
        score: Number((r.similarity * 10).toFixed(1)),
      })),
    })

    return final
  } catch (error) {
    logger.error('RAG.Reranker.Error', { error: String(error) })
    return candidates.slice(0, topK)
  }
}