# 002 Nest Retrieval Cutover

Status: Implemented (pending internal-user runtime verification)

## Goal

Move retrieval ownership from Next to Nest after shadow comparison proves quality, security, and operational parity.

## Non-goals

- This does not move LLM streaming or chat persistence.
- This does not remove the legacy retrieval path during initial rollout.

## Design

Next selects retrieval through `RAG_BACKEND=legacy|shadow|nest`. Nest owns vector recall, Jieba/TF-IDF keyword recall, RRF fusion, dedicated reranking, citations, RAG context, and the confidence-aware abstention decision (see spec 004). Next remains the browser-facing SSE endpoint and LLM caller.

`legacy` runs the current Next retrieval path. `shadow` returns the legacy result and asynchronously compares it with Nest. `nest` waits for Nest retrieval and uses its citations, context, and `decision`; a timeout, invalid response, missing token, or non-2xx Nest response falls back to the legacy path for that request.

## Feature Flags And Rollback

- `RAG_BACKEND=legacy` is the default and is the immediate rollback value.
- `RAG_BACKEND=shadow` enables asynchronous comparison. `RAG_SHADOW_NEST=true` remains a backwards-compatible alias while no explicit backend is configured.
- `RAG_BACKEND=nest` enables the Nest primary path only for an email listed in `ADMIN_EMAILS` or a user ID listed in `RAG_NEST_INTERNAL_USER_IDS`. All other users use legacy. Percentage rollout requires a separate, deterministic cohort flag before use.
- `RAG_NEST_TIMEOUT_MS` defaults to 3,500 milliseconds and is capped at 8,000 milliseconds. A timeout falls back to legacy.
- Rollback: set `RAG_BACKEND=legacy` and redeploy/restart Next. No database rollback is required.

## Acceptance Criteria

- No cross-tenant documents in Nest retrieval results.
- Nest retrieval error rate is within 1% of legacy.
- Median retrieval latency is within 20% of legacy, and its P95 remains within the agreed service budget.
- Top-5 overlap meets the threshold defined in spec 001.
- Citations contain the same source/version metadata for overlapping chunks.
- Nest failure, timeout, malformed JSON, or missing authentication never fails the chat response when a legacy retrieval can be produced.
- Unknown `RAG_BACKEND` values resolve to `legacy` and are visible in server logs.
- A request that uses Nest has the Nest citations and RAG context carried through the existing SSE metadata event.
- The Nest search response carries a validated `decision` (`ANSWER` | `ABSTAIN` + reason). The Next client validates it when present; an `ABSTAIN` decision never injects evidence context into the chat, and `RAG_ABSTENTION_MODE=enforce` returns the deterministic abstention response. A missing `decision` (older Nest) degrades to the legacy `NO_CANDIDATES` fallback.

## Open Questions

- Define the internal-user cohort and percentage rollout mechanism before enabling external `nest` traffic.
- Define the evaluation dataset and minimum sample size. Initial proposal: at least 100 representative, non-empty retrieval comparisons across supported languages and document types.

## Implementation Record

- Branch: `codex/nest-monorepo-migration`
- Commits: `fd95489` (RAG_BACKEND cutover), `22f60d4` (shadow persistence + monitor), `3fad8b4` (Nest request logging), `6c91332` (ChatPanel hardening).
- Abstention decision slice (spec 004 parity for the Nest path): `RetrievalDecisionSummarySchema` in `packages/contracts/src/chat.ts`; `apps/api/src/retrieval/rag-abstention.ts` (policy port); `RetrievalService.hybridSearch` returns `decision` with reranker `applied` status; `POST /api/retrieval/search` includes `decision`; Next chat route consumes it. Commit pending in the working tree.
- Commands run (Node `22.23.0`): `pnpm --filter @ai-arg/contracts build`, `pnpm --filter @ai-arg/api build`, `pnpm prisma:generate`, `pnpm --filter @ai-arg/web exec eslint src/app/api/chat/route.ts`.
- Manual verification: still pending an authenticated internal-user test with `RAG_BACKEND=nest`, followed by rollback verification with `RAG_BACKEND=legacy`. Requires a running Nest instance and a seeded tenant.

## Verification Notes

- Shared contracts and the Nest API build successfully under Node `22.23.0`.
- The focused chat-route lint check passes.
- Full web TypeScript verification remains blocked by pre-existing type errors in ProfileClient, Supabase cookie callbacks, AuthProvider, ChatMarkdown, I18nProviderWrapper, NavigationProgress, and middleware. None are in this slice.
