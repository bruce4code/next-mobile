import type { RetrievalDecisionSummary } from "@ai-arg/contracts"

export interface RerankConfidence {
  candidateCount: number
  rerankerApplied: boolean
  scores: number[]
}

// 与 apps/web/src/lib/rag-abstention.ts 保持对等：低置信度检索弃答决策
function readThreshold(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

export function evaluateRagDecision(confidence: RerankConfidence): RetrievalDecisionSummary {
  if (confidence.candidateCount === 0 || confidence.scores.length === 0) {
    return { outcome: "ABSTAIN", reason: "NO_CANDIDATES" }
  }
  if (!confidence.rerankerApplied) {
    return { outcome: "ABSTAIN", reason: "RERANK_UNAVAILABLE" }
  }

  const minScore = readThreshold("RAG_ABSTAIN_MIN_RERANK_SCORE", 0.6, 0, 1)
  const minGap = readThreshold("RAG_ABSTAIN_MIN_SCORE_GAP", 0.05, 0, 1)
  const [topScore, secondScore] = confidence.scores

  if (topScore < minScore) return { outcome: "ABSTAIN", reason: "LOW_TOP_SCORE" }
  if (secondScore !== undefined && topScore - secondScore < minGap) {
    return { outcome: "ABSTAIN", reason: "AMBIGUOUS_TOP_RESULT" }
  }
  return { outcome: "ANSWER" }
}
