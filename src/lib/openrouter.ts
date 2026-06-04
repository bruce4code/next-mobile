/**
 * OpenRouter API 统一配置
 *
 * 所有调用 OpenRouter 的地方都从这里读取配置，
 * 避免硬编码重复。
 */

export const OPENROUTER_CONFIG = {
  /** 默认的 API Base URL */
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  /** API Key */
  apiKey: process.env.OPENROUTER_API_KEY || '',
}

/** 默认 embedding 模型 */
export const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b'

/** 默认 reranker 模型 */
export const DEFAULT_RERANKER_MODEL = process.env.RERANKER_MODEL || 'qwen/qwen3-8b'

/** 默认对话模型候选列表 */
export const DEFAULT_CHAT_MODELS = (process.env.OPENROUTER_MODEL?.split(',').map(m => m.trim()).filter(Boolean)) || [
  'stepfun/step-3.5-flash',
  'nvidia/nemotron-3-super',
  'arcee-ai/trinity-large-preview',
  'z-ai/glm-4.5-air',
]