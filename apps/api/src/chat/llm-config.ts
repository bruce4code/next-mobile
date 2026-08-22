/**
 * LLM configuration for Nest, mirroring apps/web/src/lib/llm-config.ts.
 *
 * Both services read the same .env, so the precedence rules must match or the
 * two backends talk to different providers with different models:
 *
 *   API key:  SILICONFLOW_API_KEY  →  OPENROUTER_API_KEY
 *   Base URL: LLM_BASE_URL         →  OPENROUTER_BASE_URL  →  siliconflow
 *   Model:    LLM_MODEL            →  OPENROUTER_MODEL     →  Qwen/Qwen3-8B
 *
 * LLM_MODEL is a comma-separated candidate list; the chat service tries each in
 * order so a single unavailable model does not fail the request.
 */

export const LLM_CONFIG = {
  baseURL:
    process.env.LLM_BASE_URL ||
    process.env.OPENROUTER_BASE_URL ||
    "https://api.siliconflow.cn/v1",
  apiKey: process.env.SILICONFLOW_API_KEY || process.env.OPENROUTER_API_KEY || "",
}

const DEFAULT_CHAT_MODELS = ["Qwen/Qwen3-8B"]

export function resolveModelCandidates(): string[] {
  const raw = process.env.LLM_MODEL || process.env.OPENROUTER_MODEL
  const configured = raw
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean)

  if (configured && configured.length > 0) {
    return configured
  }

  return DEFAULT_CHAT_MODELS
}
