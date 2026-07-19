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

## Next Slice: Retrieval Extraction

Objective: make NestJS produce the same retrieval results, citations, and RAG context as the existing Next.js implementation while Next continues to own LLM streaming and browser-facing SSE.

Planned work:

1. Add a Nest retrieval module with user-scoped access only.
2. Move query rewriting, hybrid search, reranking, and citation mapping behind the Nest service boundary.
3. Have Next call Nest behind a disabled-by-default feature flag.
4. Add sampled parity logging for legacy and Nest retrieval responses.
5. Enable the flag only after retrieval, citation, latency, and error-rate checks meet the agreed threshold.

## Operational Checklist

- Propagate `requestId` across Next, Nest, LLM, and ingestion processing.
- Record user ID, model, retrieval mode, document count, citation IDs, and latency in structured logs.
- Keep LangSmith traces during the migration.
- Verify tenant isolation for every Nest query.
- Document rollback behavior before enabling each feature flag.

## Known Constraints

- GitNexus MCP resources are unavailable in the current environment, so its required impact and change-detection checks cannot run.
- The existing web package has unrelated lint errors that prevent a fully green production build after compilation.
