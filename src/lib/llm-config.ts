/**
 * LLM API 统一配置
 *
 * 硅基流动优先，OpenRouter 做 fallback，兼容 OpenAI 格式。
 *
 * 环境变量优先级规则：
 *   API Key:   SILICONFLOW_API_KEY  →  OPENROUTER_API_KEY
 *   Base URL:  LLM_BASE_URL         →  OPENROUTER_BASE_URL
 *   Model:     LLM_MODEL            →  OPENROUTER_MODEL
 *
 * 填入 SILICONFLOW_API_KEY 即可用免费模型（Qwen3-8B, bge-m3 等）。
 * 不填 fallback 到 OPENROUTER_API_KEY，旧 .env 无需改动。
 *
 * @see https://docs.siliconflow.cn/api-reference
 */

export const LLM_CONFIG = {
  baseURL: process.env.LLM_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://api.siliconflow.cn/v1',
  apiKey: process.env.SILICONFLOW_API_KEY || process.env.OPENROUTER_API_KEY || '',
}

// ─── embedding ────────────────────────────────────────────
export const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B'

// ─── reranker ─────────────────────────────────────────────
export const DEFAULT_RERANKER_MODEL = process.env.RERANKER_MODEL || 'Qwen/Qwen3-8B'

// ─── chat ─────────────────────────────────────────────────
export const DEFAULT_CHAT_MODELS = (() => {
  const raw = process.env.LLM_MODEL || process.env.OPENROUTER_MODEL
  if (raw) return raw.split(',').map(m => m.trim()).filter(Boolean)
  return ['Qwen/Qwen3-8B']
})()