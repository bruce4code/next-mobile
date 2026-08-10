# 001 RAG Shadow Comparison

Status: Implementing

## Goal

Compare Nest retrieval against the active Next legacy RAG pipeline without changing the answer delivered to a chat user.

## Non-goals

- Nest retrieval must not replace the legacy retrieval result in this phase.
- Raw user prompts and document content must not be persisted for comparison monitoring.

## Design

Next handles the chat request and legacy RAG retrieval. If `RAG_SHADOW_NEST=true`, Next asynchronously forwards the rewritten query and Supabase access token to Nest. Nest returns retrieval results. Next writes comparison metadata to `RagShadowComparison` while continuing to stream the legacy answer.

## Contract

- Nest endpoint: `POST /api/retrieval/search`
- Authentication: `Authorization: Bearer <Supabase access token>`
- Shared request schema: `SearchRetrievalRequestSchema` in `packages/contracts`
- Nest output used for comparison: ordered document IDs

## Data And Security

`RagShadowComparison` stores user ID, SHA-256 query hash, result document IDs, counts, overlap, latency, status, error summary, and timestamp.

- Every Nest query must derive tenant scope from the verified token.
- The admin monitor is gated by `ADMIN_EMAILS`.
- No raw prompt or document text is stored in comparison records.

## Feature Flags And Rollback

- `RAG_SHADOW_NEST=false` by default.
- `NEST_API_URL` identifies the internal Nest service.
- Rollback: set `RAG_SHADOW_NEST=false` and restart Next. Existing chat behavior remains unchanged.

## Acceptance Criteria

- Shadow failure never changes, delays, or fails the legacy chat response.
- Each eligible chat request records `COMPLETED`, `FAILED`, or `SKIPPED`.
- `/[locale]/admin/rag-shadow` shows the latest records to allowlisted administrators only.
- No retrieval result crosses tenant boundaries.
- At least 80% average Top-5 document overlap across a representative evaluation set before traffic cutover is considered.

## Implementation Record

- Branches: `codex/retrieval-shadow-mode`, `codex/nest-monorepo-migration`
- Migration: `20260720000000_add_rag_shadow_comparisons`

## Open Questions

- What minimum sample size is required before evaluating the 80% overlap gate?
- What retention period should apply to comparison records?
