# ai-arg-monorepo

An enterprise knowledge-base chat application built around a hybrid-retrieval RAG
pipeline, mid-migration from an all-Next.js stack to a Next.js + NestJS monorepo.

Next.js owns the browser experience and LLM streaming; NestJS is progressively
taking ownership of retrieval and ingestion behind feature flags, so no capability
moves until it passes parity checks.

## Architecture

```
apps/
  web/       Next.js 15 (App Router, React 19) — UI, chat SSE, current RAG owner
  api/       NestJS 11 — retrieval/ingestion migration target
packages/
  contracts/ Zod schemas shared across web + api (@ai-arg/contracts)
  config/    Shared configuration (@ai-arg/config)
prisma/      Root-owned schema + migrations (PostgreSQL + pgvector)
```

- **Package manager:** pnpm 11 workspace, Node >= 22.13
- **Database:** PostgreSQL with the `pgvector` extension (1536-dim embeddings)
- **Auth:** Supabase bearer tokens; every retrieval query is tenant-scoped by user
- **LLM / embeddings:** OpenAI-compatible provider (SiliconFlow / OpenRouter), traced with LangSmith

## RAG pipeline

The chat route runs a hybrid-retrieval pipeline before streaming a response:

1. **Query rewriting** — collapses follow-up questions into the prior question for better recall.
2. **Keyword gate** — Jieba TF-IDF extraction; greetings / chit-chat with no usable keyword skip RAG entirely.
3. **Hybrid search** — parallel pgvector cosine search + BM25-style keyword search, fused with Reciprocal Rank Fusion (`RRF_K=60`).
4. **Reranking** — dedicated `/rerank` call (`bge-reranker-v2-m3`) with deterministic fallback to fused order on failure or timeout.
5. **Abstention** — refuses to answer on low confidence (no candidates, reranker unavailable, low top score, or ambiguous top-2 gap). Modes: `disabled` / `observe` / `enforce`.
6. **Injection-safe context** — evidence is wrapped in `<evidence>` tags marked as untrusted; the model must cite `[S1]`, `[S2]` and cannot invent sources.
7. **Streaming** — SSE with model fallback across candidates.

### Retrieval backend selection

Retrieval ownership is controlled by `RAG_BACKEND`:

| Value | Behavior |
|-------|----------|
| `legacy` | Next.js owns retrieval (default, immediate rollback value) |
| `shadow` | Next serves the legacy result and asynchronously compares it against Nest, logging overlap to `RagShadowComparison` (see the admin monitor at `/{locale}/admin/rag-shadow`) |
| `nest` | Next consumes Nest retrieval, gated to `ADMIN_EMAILS` / `RAG_NEST_INTERNAL_USER_IDS`, with a bounded timeout and per-request legacy fallback |

## Getting started

### Prerequisites

- Node >= 22.13, pnpm >= 11
- A PostgreSQL database with the `pgvector` extension enabled
- A Supabase project (URL + anon key)
- An OpenAI-compatible API key for chat, embeddings, and reranking

### Setup

```bash
pnpm install
cp .env.example .env          # fill in credentials — never commit real values
pnpm prisma:generate
pnpm --filter @ai-arg/web exec prisma migrate deploy --schema ../../prisma/schema.prisma
```

### Develop

```bash
pnpm dev        # Next.js web app on http://localhost:8000
pnpm dev:api    # NestJS API on http://localhost:4000 (builds contracts first)
```

### Build & lint

```bash
pnpm build      # contracts -> config -> api -> web
pnpm lint       # web + api
```

## Environment

Configuration lives in `.env` (see `.env.example` for the full list). Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (pgvector-enabled) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase auth |
| `NEST_API_URL` | NestJS API base URL used by the web app |
| `RAG_BACKEND` | `legacy` \| `shadow` \| `nest` retrieval selection |
| `RAG_NEST_TIMEOUT_MS` | Nest retrieval timeout (default 3500, capped at 8000) |
| `RAG_NEST_INTERNAL_USER_IDS` | Comma-separated user IDs allowed on the `nest` backend |
| `RAG_ABSTENTION_MODE` | `disabled` \| `observe` \| `enforce` low-confidence abstention |
| `ADMIN_EMAILS` | Comma-separated allowlist for internal admin pages |

## Documentation

- `docs/next-nest-migration.md` — migration log, completed slices, rollback notes
- `docs/specs/` — retrieval cutover and chunking specs
- `RAG_JOURNEY.md`, `RAG_OPTIMIZATION.md` — RAG design deep-dives
- `blog/` — hybrid search / RRF / index comparison write-ups
