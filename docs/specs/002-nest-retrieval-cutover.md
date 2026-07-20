# 002 Nest Retrieval Cutover

Status: Draft

## Goal

Move retrieval ownership from Next to Nest after shadow comparison proves quality, security, and operational parity.

## Non-goals

- This does not move LLM streaming or chat persistence.
- This does not remove the legacy retrieval path during initial rollout.

## Design

Next selects retrieval through `RAG_BACKEND=legacy|shadow|nest`. Nest owns vector recall, Jieba/TF-IDF keyword recall, RRF fusion, dedicated reranking, citations, and RAG context. Next remains the browser-facing SSE endpoint.

## Feature Flags And Rollback

- Start with `RAG_BACKEND=legacy`.
- Enable `shadow`, then limited internal `nest` traffic, then broader rollout.
- Rollback: set `RAG_BACKEND=legacy`; no database rollback is required.

## Acceptance Criteria

- No cross-tenant documents in Nest retrieval results.
- Nest retrieval error rate is within 1% of legacy.
- Median retrieval latency is within 20% of legacy.
- Top-5 overlap meets the threshold defined in spec 001.
- Citations contain the same source/version metadata for overlapping chunks.

## Open Questions

- Define internal-user cohort and rollout percentage steps.
- Define automated evaluation dataset and minimum sample size.
