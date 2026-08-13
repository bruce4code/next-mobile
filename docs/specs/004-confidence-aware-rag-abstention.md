# 004 Confidence-Aware RAG Abstention

Status: Validating

## Goal

Ensure that a knowledge-base answer is generated only when the retrieval pipeline has sufficient, relevant evidence. When evidence is absent or does not meet the calibrated confidence policy, the system must return a deterministic knowledge-base abstention response instead of falling through to a general-purpose model answer.

## Non-goals

- This phase does not introduce a trained confidence model, LLM-as-a-judge, or a new embedding provider.
- This phase does not change document parsing, chunking, embeddings, tenant isolation, or citation formats.
- This phase does not make the assistant refuse ordinary non-RAG chat when the user has explicitly disabled RAG.
- This phase does not expose raw retrieval scores or internal thresholds to end users.

## Current State

The legacy Next retrieval path filters vector recall at `DEFAULT_MIN_SIMILARITY` and hybrid results at `RAG_MIN_EVIDENCE_SCORE`. Its RAG prompt instructs the model to say that the knowledge base lacks sufficient information when evidence is insufficient.

This is not a hard refusal boundary: when no RAG context is created, `apps/web/src/app/api/chat/route.ts` continues through the normal chat-completion path. In addition, vector similarity, keyword matching scores, and reranker relevance scores have different meanings and cannot safely share one threshold. The text-search fallback currently assigns a synthetic score of `0.55`, so it must not be treated as confidence evidence.

The Nest retrieval path now produces the same decision: as of slice 13, `POST /api/retrieval/search` evaluates the deterministic policy after recall, fusion, and reranking, and returns `decision` alongside `documents`, `citations`, and `context`. The Next chat route consumes it for the `nest` backend instead of the previous crude `NO_CANDIDATES` fallback. Shadow comparison does not yet record decision agreement between the two owners.

## Design

### Ownership And Flow

Both retrieval owners, the legacy Next path and the Nest path, must produce an internal retrieval decision after recall, fusion, and reranking:

1. Retrieve candidates using the existing vector and keyword paths.
2. Rerank the final candidate set whenever a reranker is configured and available.
3. Evaluate a deterministic abstention policy using only comparable scores from the final ranking stage.
4. Return either `ANSWER` with citations/context or `ABSTAIN` with no evidence context.
5. The Next chat route inserts RAG context only for `ANSWER`. For `ABSTAIN`, it returns the configured knowledge-base abstention response without calling the general chat-completion model.

`RAG_BACKEND=legacy|shadow|nest` remains the retrieval owner selector. In shadow mode, the user-visible owner makes the decision and the other owner records a comparable decision asynchronously.

### Decision Policy

The policy is evaluated after reranking. Reranker relevance score is the primary signal because it compares the actual query with each candidate. Vector similarity remains a recall filter only. Keyword match scores and RRF ranks may be logged as supporting diagnostics but must not independently authorize an answer.

Initial decision rules:

- `ABSTAIN_NO_CANDIDATES`: no final candidate remains after recall and filtering.
- `ABSTAIN_RERANK_UNAVAILABLE`: candidates exceed the direct-answer limit and reranking fails or is unavailable. The system fails closed for knowledge-base mode rather than treating RRF order as confidence.
- `ABSTAIN_LOW_TOP_SCORE`: the highest reranker score is below `RAG_ABSTAIN_MIN_RERANK_SCORE`.
- `ABSTAIN_AMBIGUOUS_TOP_RESULT`: the highest score is above the minimum but its gap to the second result is below `RAG_ABSTAIN_MIN_SCORE_GAP`, when at least two candidates exist.
- `ANSWER`: none of the abstention rules applies and at least one cited result remains.

The initial defaults are evaluation hypotheses, not production guarantees:

- `RAG_ABSTAIN_MIN_RERANK_SCORE=0.60`
- `RAG_ABSTAIN_MIN_SCORE_GAP=0.05`

They must be calibrated on a labeled evaluation set before external rollout. A request with one candidate skips the score-gap rule. A direct answer based on a single candidate is allowed only when its top score meets the minimum score.

The legacy text `ILIKE` fallback may still supply recall candidates, but its synthetic `0.55` score must never pass the policy by itself. It requires a successful reranker result before an `ANSWER` decision.

### User Response

For an `ABSTAIN` decision while RAG is enabled, the user-visible response is exactly:

`知识库中暂无足够信息，请补充相关文档后再试。`

It contains no citations, no generated answer, and no internal reason code. The chat metadata event may include `ragDecision: "ABSTAIN"` and an internal-safe reason code for authenticated product diagnostics; it must not include numeric scores by default.

Existing UI behavior that recognizes the fixed abstention text remains compatible. The response is a completed chat turn, not an HTTP error.

## Contract

Introduce an internal shared retrieval-decision type in `packages/contracts`:

```ts
type RetrievalDecision =
  | {
      outcome: "ANSWER"
      documents: RetrievedDocument[]
      citations: RAGCitation[]
      context: string
      diagnostics?: RetrievalDiagnostics
    }
  | {
      outcome: "ABSTAIN"
      reason: "NO_CANDIDATES" | "RERANK_UNAVAILABLE" | "LOW_TOP_SCORE" | "AMBIGUOUS_TOP_RESULT"
      documents: []
      citations: []
      context: ""
      diagnostics?: RetrievalDiagnostics
    }
```

`RetrievalDiagnostics` is server-side by default and may include backend, candidate count, reranker availability, score bucket, and policy version. It must never include chunk content or raw vectors.

`POST /retrieval/search` may add `decision` to its response while retaining the existing `documents`, `citations`, and `context` fields for compatibility during migration. Slice 13 implements this with the lighter `RetrievalDecisionSummarySchema` (`ANSWER` | `ABSTAIN` + reason, defined in `packages/contracts/src/chat.ts`): because the search response already carries the payload fields at the top level, only the outcome and reason ride in `decision`. The full `RetrievalDecision` schema remains available for owners that embed the fields. The Next-to-Nest retrieval client must validate the new field when it is present. Until both owners support it, a missing decision is treated as `ANSWER` only if citations and non-empty context are both present; otherwise it is `ABSTAIN_NO_CANDIDATES`.

The browser-facing chat SSE metadata may add optional fields `ragDecision` and `ragAbstainReason`. Existing consumers must tolerate their absence.

## Data And Security

No database migration is required for the initial policy.

- Evaluation and production logs must include a request ID, retrieval backend, policy version, decision reason, candidate count, and latency.
- Do not log raw query text, document content, embeddings, or raw score arrays in routine production logs. Restricted evaluation data may retain labeled queries under the existing tenant and retention policies.
- The abstention decision is computed only after existing user and document-status filtering, so it must not weaken tenant isolation.
- A retrieval failure is not evidence. If a configured retrieval owner cannot produce a validated result and no legacy fallback succeeds, return the same abstention response.

## Feature Flags And Rollback

- `RAG_ABSTENTION_MODE=disabled|observe|enforce`; default `disabled`.
- `observe` computes and logs the decision but preserves current behavior, allowing threshold calibration without user-visible refusals.
- `enforce` returns the deterministic abstention response for `ABSTAIN` decisions.
- `RAG_ABSTAIN_MIN_RERANK_SCORE` and `RAG_ABSTAIN_MIN_SCORE_GAP` are validated numeric configuration values. Invalid values use documented defaults and emit a startup warning.
- Rollback: set `RAG_ABSTENTION_MODE=disabled` and restart the affected service. No data rollback is required.

## Acceptance Criteria

- With `RAG_ABSTENTION_MODE=enforce`, an empty retrieval result never invokes the general chat-completion model for an RAG-enabled request.
- A successful reranked result below the configured top-score threshold returns the fixed abstention response with no citations.
- A result whose top-two score gap is below the configured threshold returns the fixed abstention response with no citations.
- A single reranked result above the top-score threshold can produce an answer.
- A keyword-only or text-fallback result cannot produce an answer without a successful reranker score.
- Reranker timeout, malformed response, or unavailable credentials fails closed to abstention when knowledge-base mode is enabled.
- The `observe` mode changes no user-visible response but emits decision metrics for every eligible RAG request.
- Legacy, shadow, and Nest paths record the same decision schema and reason vocabulary.
- Existing citation response fields and clients remain compatible while the optional decision field is rolled out.
- A labeled evaluation set contains at least 100 answerable and 100 unanswerable representative queries before enabling enforcement for external users.
- Before external rollout, answerable-query refusal rate and unanswerable-query false-answer rate meet agreed targets; proposed initial gates are at most 5% and at most 10%, respectively.

## Implementation Plan

1. Add shared Zod schemas/types for retrieval decisions and safe diagnostics. — Done (`RetrievalDecisionSchema`, `RetrievalDecisionSummarySchema`).
2. Extract a pure, unit-tested policy function that accepts final reranker scores and configuration. — Done in `apps/web/src/lib/rag-abstention.ts`; policy unit tests remain a gap.
3. Have the legacy Next retrieval path return the decision and update the chat route to enforce it behind the feature flag. — Done (`812d706`, `RAG_ABSTENTION_MODE`).
4. Add the same policy to Nest and extend shadow comparison to record decision agreement. — Partially done: Nest policy implemented in slice 13 (`apps/api/src/retrieval/rag-abstention.ts`); shadow decision-agreement recording is pending.
5. Add request metrics, an evaluation fixture set, and an internal `observe` rollout. — Pending.
6. Calibrate the thresholds, enforce for an internal cohort, then expand rollout only after the acceptance gates hold. — Pending.

## Implementation Record

- Branch: pending
- Commits: `812d706` (`feat(rag): enforce low-confidence abstention`).
- Nest parity (slice 13): added `RetrievalDecisionSummarySchema` to `packages/contracts/src/chat.ts`; ported the policy to `apps/api/src/retrieval/rag-abstention.ts`; `RetrievalService.hybridSearch` now returns a `decision` and the dedicated reranker reports `applied` status so `RERANK_UNAVAILABLE` is distinguishable from genuine low confidence; `POST /api/retrieval/search` includes `decision`; the Next chat route validates and consumes it for the `nest` backend. Commit pending in the working tree.
- Commands run: `pnpm --filter @ai-arg/contracts build`; `pnpm --filter @ai-arg/web exec eslint src/lib/rag.ts src/lib/rag-abstention.ts src/lib/reranker.ts src/app/api/chat/route.ts`; `pnpm --filter @ai-arg/api build`; focused `tsx` policy assertions.
- Manual verification: an authenticated local chat request with `RAG_ABSTENTION_MODE=enforce` returned the fixed abstention text for the out-of-knowledge-base query `零零落落`. The response contained no citations and bypassed the normal answer path. `observe` telemetry and external-user rollout remain pending. Nest-path decision verification remains pending an authenticated `RAG_BACKEND=nest` request against a running Nest instance.

## Open Questions

- Does the selected reranker score have a stable enough calibration across Chinese, English, and mixed-language content to use one threshold, or should configuration be per language/model?
- Should a future policy include answer-coverage validation after generation, such as citation entailment checks, in addition to retrieval confidence?
- What owner and retention policy should apply to the labeled evaluation dataset and user-feedback signals?
