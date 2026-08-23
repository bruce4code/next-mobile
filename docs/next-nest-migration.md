# Next.js to NestJS Migration Log

## Goal

Move RAG, ingestion, and API orchestration from Next.js route handlers to NestJS without disrupting the existing browser experience or changing database ownership prematurely.

## Migration Rules

- Next.js remains the browser-facing application until the streaming cutover.
- NestJS becomes the sole owner of a capability only after that capability has passed parity checks.
- Do not allow both applications to write the same resource during a cutover.
- Preserve Supabase as the identity provider and derive the tenant from a verified access token.
- Keep the existing Prisma schema and migrations at the repository root during this migration.

## Branch Model

- Integration branch: `codex/nest-monorepo-migration`
- Completed slices are committed on a focused branch, verified, then fast-forwarded into the integration branch.
- Runtime cutovers use feature flags rather than long-lived legacy and replacement branches.

## Completed Slices

### 0. Nest API Error Contract

- Status: implemented; static verification complete, live HTTP verification pending

Changes:

- Every Nest request receives a server-generated UUID in `X-Request-Id`, including failures.
- A global response interceptor and exception filter normalize JSON responses to `{ code, error, data, requestId }`: success uses `code: "OK"`, `error: null`, and resource data; failure uses `data: null` and may include `details`. HTTP status remains authoritative and unexpected 5xx responses do not expose internals.
- Chat SSE retains its existing event protocol. During migration, Next proxies unwrap successful Nest `data` so existing browser pages preserve their legacy resource shapes, but forward Nest errors unchanged. `DOCUMENT_NOT_FOUND` is the first resource-specific code; generic status-derived codes cover validation, authentication, authorization, conflict, rate-limit, service-unavailable, and internal failures.

Rollback:

- Remove the global filter and request ID middleware. This changes no database state, but consumers relying on `code` should be reverted in the same deployment.

Verification:

- `pnpm --filter @ai-arg/contracts build` passed.
- `pnpm --filter @ai-arg/api build` passed.
- Targeted web ESLint for the Nest JSON proxy routes passed.
- Nest is listening on port `4000`; live request verification remains pending because the current execution sandbox cannot reach the host listener.

### 1. Monorepo Foundation

- Branch: `codex/monorepo-foundation`
- Commit: `0611da6 chore(monorepo): establish Next and Nest workspace`
- Status: merged into the integration branch

Changes:

- Moved the existing Next.js application to `apps/web`.
- Added the NestJS application scaffold at `apps/api`.
- Added `packages/contracts` and `packages/config`.
- Added pnpm workspace orchestration and Node `22.23.0` pinning.
- Kept Prisma schema, migrations, scripts, and existing RAG behavior in place.

Verification:

- Nest scaffold compiled successfully.
- Next development server responded on port 8000.
- Next production compilation reached lint/type checking; existing legacy lint failures remain outside this migration scope.

Rollback:

- Revert commit `0611da6` before deploying any Nest-backed capability.

### 2. Nest Authentication Boundary

- Branch: `codex/nest-api-foundation`
- Commit: `840148e feat(api): add Supabase authentication boundary`
- Status: merged into the integration branch

Changes:

- Added global bearer-token authentication in NestJS using Supabase token verification.
- Marked `/api/health` as public.
- Added protected `/api/auth/me` for service verification.
- Added a non-secret `.env.example` describing shared Supabase settings.

Verification:

- Nest compilation passed.
- `/api/health` returned `200` without credentials.
- `/api/auth/me` returned `401` without a bearer token.

Rollback:

- Revert commit `840148e`; no Next route or database behavior depends on it yet.

### 3. Shared Transport Contracts

- Branch: `codex/shared-contracts`
- Commit: `8a146f8 feat(contracts): define chat and ingestion APIs`
- Status: merged into the integration branch

Changes:

- Added version-neutral Zod schemas for chat requests, RAG citations, stream metadata, chat persistence, documents, ingestion, pagination, and API errors.
- Preserved existing API limits and defaults.

Verification:

- Contracts package compiled.
- Representative chat and ingestion payloads parsed with the existing defaults.

Rollback:

- Revert commit `8a146f8`; contracts are not yet consumed by runtime endpoints.

### 4. Retrieval Context Preparation

- Branch: `codex/retrieval-service`
- Status: completed

Changes:

- Added a protected Nest retrieval module that owns follow-up query rewriting, citation mapping, and prompt-safe RAG context construction.
- Added shared request and retrieved-document contracts for the internal context-preparation boundary.
- Kept the existing Next.js database-backed hybrid search and browser-facing SSE flow unchanged.

Verification:

- Contracts and Nest API compilation passed.
- Follow-up query rewriting, citation IDs, and prompt-injection safety text match the existing retrieval trust behavior.
- `/api/retrieval/prepare-context` returns `401` without a bearer token.

Rollback:

- Revert this slice before making the Nest endpoint available to Next.js; no runtime caller depends on it yet.

### 5. Nest Database Access

- Branch: `codex/database-retrieval`
- Status: in progress

Objective:

- Add lifecycle-managed, read-only-capable Prisma access to NestJS against the existing root schema before moving database-backed retrieval.

### 6. Tenant-Scoped Vector Retrieval

- Branch: `codex/hybrid-retrieval`
- Status: completed

Changes:

- Added protected `POST /api/retrieval/search` in NestJS.
- Generates a query embedding through the configured OpenAI-compatible provider.
- Uses pgvector against `DocumentChunk` and filters every query by the authenticated user ID and `READY` document status.
- Returns retrieved documents, citations, and the existing evidence-safe RAG context.

Verification:

- Shared contracts and Nest API compile successfully.
- The SQL path is read-only and applies tenant filtering before vector ordering.

Rollback:

- Revert this slice; Next.js remains the active retrieval path and does not call the Nest endpoint.

### 7. Keyword Recall and RRF Fusion

- Branch: `codex/keyword-rrf-retrieval`
- Status: completed

Changes:

- Added a read-only keyword recall query with the same tenant, status, and metadata filters as vector retrieval.
- Added parallel vector and keyword recall with reciprocal-rank fusion using `RRF_K = 60`.

Known parity gap:

- Dedicated reranking remains to be extracted before enabling the Nest path in Next.js.

### 8. Jieba Keyword Extraction

- Branch: `codex/jieba-keyword-retrieval`
- Status: completed

Changes:

- Replaced full-query keyword recall with the same Jieba dictionary and TF-IDF primitives used by the legacy Next.js path.
- Retained the full query as a fallback when no usable keyword is extracted.

### 9. Dedicated Reranking

- Branch: `codex/dedicated-reranker`
- Status: completed

Changes:

- Added the configured provider's dedicated `/rerank` call after RRF fusion.
- Uses the legacy model default and eight-second timeout.
- Retains deterministic fused ordering for missing credentials, provider failures, invalid responses, and timeouts.

### 10. Shadow Comparison Operations

- Branch: `codex/retrieval-shadow-mode`
- Status: completed

Changes:

- Added disabled-by-default Next-to-Nest retrieval shadow requests with authenticated token forwarding and document-overlap logging.
- Added the admin-only `/{locale}/admin/rag-shadow` operational status page, gated by `ADMIN_EMAILS`.
- Aligned web Prisma dependencies and initialized i18n from the SSR resource snapshot to prevent runtime and hydration failures.

### 11. Controlled Retrieval Cutover

- Branch: `codex/nest-monorepo-migration`
- Status: implemented, pending internal-user runtime verification

Changes:

- Added `RAG_BACKEND=legacy|shadow|nest` selection to the Next chat route.
- Used Nest's context and citations only for `nest`, with a bounded timeout and per-request legacy fallback.
- Gated `nest` traffic to `ADMIN_EMAILS` and `RAG_NEST_INTERNAL_USER_IDS`.
- Persisted shadow comparisons in `RagShadowComparison` and surfaced them in the admin monitor.

See `docs/specs/002-nest-retrieval-cutover.md` for the full spec and verification record.

### 12. Ingestion Processor Parallel Build

- Branch: `codex/nest-monorepo-migration`
- Status: built and statically verified; not yet cut over

Objective: rebuild the ingestion job processor in NestJS alongside the Next implementation, matching existing behavior byte-for-byte, without switching any runtime traffic.

Changes:

- Added `apps/api/src/ingestion/`: `chunking.ts` (langchain splitters, ported unchanged), `embedding.service.ts` (`EmbeddingCache`-backed embedding generation), `ingestion.service.ts` (stale-lock recovery, `FOR UPDATE SKIP LOCKED` claim, version-guarded chunk/embed transaction, exponential retry backoff), and a worker-secret-guarded `POST /api/ingestion/process`.
- Reused the existing `ProcessIngestionRequestSchema` contract; no schema or Next changes.
- Added `@langchain/textsplitters` to the api package.

Scope boundary:

- Document enqueue (`enqueueDocumentIngestion`/`enqueueDocumentReindex`), the `documents` CRUD, and Supabase source archiving remain in Next because they are bound to the browser session.
- Next remains the sole active ingestion processor. No feature flag ships in this slice.

Verification:

- `@ai-arg/contracts` and `@ai-arg/api` build successfully and `tsc --noEmit` passes under Node `22.23.0`; the `IngestionModule` resolves under Nest DI.
- Runtime parity (identical chunk count, `chunkingVersion`/`parserVersion`/`embeddingModel`, and chunk offsets/headings between the Next and Nest processors) remains pending a real database.

### 13. Nest Retrieval Abstention Decision

- Branch: `codex/nest-monorepo-migration`
- Status: implemented; pending runtime verification against a live Nest deployment

Changes:

- Added `RetrievalDecisionSummarySchema` (`ANSWER` | `ABSTAIN` + reason) to `@ai-arg/contracts`.
- Ported the legacy low-confidence abstention evaluation into `apps/api/src/retrieval/rag-abstention.ts`, reading the same `RAG_ABSTAIN_MIN_RERANK_SCORE` / `RAG_ABSTAIN_MIN_SCORE_GAP` thresholds.
- `RetrievalService.hybridSearch` now returns a `decision` alongside documents; the dedicated reranker reports `applied` status so `RERANK_UNAVAILABLE` is distinguishable from genuine low confidence.
- `POST /api/retrieval/search` response now includes `decision`.
- The Next chat route consumes `decision` for the `nest` backend instead of the previous crude `NO_CANDIDATES` fallback; a null-guarded fallback keeps compatibility with older Nest responses.

Scope boundary:

- Abstention *enforcement* (`RAG_ABSTENTION_MODE` disabled/observe/enforce and the SSE abstention response) remains in Next, which stays the browser-facing application.

Rollback:

- Revert this slice; `RAG_BACKEND=legacy` never calls Nest and is unaffected.

### 14. Nest Chat Persistence Continuity

- Branch: `codex/nest-monorepo-migration`
- Status: implemented; local end-to-end verification pending

Changes:

- Added the browser-generated `conversationId` to the shared chat request contract.
- `ChatPanel` forwards that ID to `/api/chat` and retains legacy `/api/save-chat` writes only when `CHAT_BACKEND=web`.
- Nest now persists the user and assistant messages under the supplied ID, retaining `requestId` and citations in the assistant metadata.
- Updated direct Nest SSE parity and latency scripts to include a unique conversation ID.

Expected result:

- With `CHAT_BACKEND=nest`, one send yields exactly two database rows, both owned by the frontend conversation ID; no browser calls to `/api/save-chat` occur.

Rollback:

- Set `NEXT_PUBLIC_CHAT_BACKEND=web` and restart the web process. The browser resumes legacy `/api/save-chat` persistence without a database migration.

## Next Slice: Ingestion Cutover

Objective: allow the ingestion worker to drive Nest processing behind a flag, then retire the Next processor once parity holds. LLM streaming migration follows the ingestion cutover.

## Operational Checklist

- Propagate `requestId` across Next, Nest, LLM, and ingestion processing.
- Record user ID, model, retrieval mode, document count, citation IDs, and latency in structured logs.
- Keep LangSmith traces during the migration.
- Verify tenant isolation for every Nest query.
- Document rollback behavior before enabling each feature flag.

## Known Constraints

- GitNexus MCP resources are unavailable in the current environment, so its required impact and change-detection checks cannot run.
- The existing web package has unrelated lint errors that prevent a fully green production build after compilation.
