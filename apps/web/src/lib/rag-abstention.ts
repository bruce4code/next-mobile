import type { RetrievalAbstainReason } from '@ai-arg/contracts'

export const RAG_ABSTENTION_MESSAGE = '知识库中暂无足够信息，请补充相关文档后再试。'

export type RagAbstentionMode = 'disabled' | 'observe' | 'enforce'

export interface RerankConfidence {
  candidateCount: number
  rerankerApplied: boolean
  scores: number[]
}

export type RagDecision =
  | { outcome: 'ANSWER' }
  | { outcome: 'ABSTAIN'; reason: RetrievalAbstainReason }

function readThreshold(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

export function getRagAbstentionMode(): RagAbstentionMode {
  const mode = process.env.RAG_ABSTENTION_MODE
  return mode === 'observe' || mode === 'enforce' ? mode : 'disabled'
}

export function evaluateRagDecision(confidence: RerankConfidence): RagDecision {
  if (confidence.candidateCount === 0 || confidence.scores.length === 0) {
    return { outcome: 'ABSTAIN', reason: 'NO_CANDIDATES' }
  }
  if (!confidence.rerankerApplied) {
    return { outcome: 'ABSTAIN', reason: 'RERANK_UNAVAILABLE' }
  }

  const minScore = readThreshold('RAG_ABSTAIN_MIN_RERANK_SCORE', 0.6, 0, 1)
  const minGap = readThreshold('RAG_ABSTAIN_MIN_SCORE_GAP', 0.05, 0, 1)
  const [topScore, secondScore] = confidence.scores

  if (topScore < minScore) return { outcome: 'ABSTAIN', reason: 'LOW_TOP_SCORE' }
  if (secondScore !== undefined && topScore - secondScore < minGap) {
    return { outcome: 'ABSTAIN', reason: 'AMBIGUOUS_TOP_RESULT' }
  }
  return { outcome: 'ANSWER' }
}
