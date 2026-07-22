# Enterprise Agentic RAG Delivery Record

This document records the architecture work completed in each delivery phase and the operational gates required before deployment.

## Phase 0: Security Baseline

Status: implemented in the working tree.

- All document list, search, update, delete, and RAG retrieval queries are scoped to the authenticated owner.
- Chat and feedback APIs require authentication and bounded Zod-validated payloads.
- Chat history derives ownership from the authenticated session instead of client-provided user IDs.
- Sensitive query/content fields are redacted from structured application logs.
- Embedding cache keys use full-content SHA-256 hashes.

Remaining enterprise step: replace owner-level isolation with `Organization`, `Membership`, and knowledge-base ACLs before onboarding multiple customer organizations.

## Phase 1: Durable Ingestion

Status: implemented; database migration is not yet deployed.

- Document create and edit return `202 Accepted` and create durable `IngestionJob` records.
- Workers atomically claim jobs with PostgreSQL `FOR UPDATE SKIP LOCKED`.
- Failed jobs retry with bounded exponential backoff; expired final-attempt locks are marked failed.
- Document versions prevent stale workers from publishing superseded content.
- Chunk replacement and document publication occur in one transaction.
- Only `READY` documents participate in retrieval.
- Chunk provenance includes heading, source offsets, source version, parser version, chunking version, and source metadata.
- Embedding calls are batched to avoid provider request-size limits.
- Optional private Supabase Storage archival preserves every source version.
- The knowledge UI shows ingestion status and polls while work is active.

Deployment gate:

```bash
npx prisma migrate deploy
npx prisma generate
npm run worker:ingestion
```

For Supabase source archival, run `supabase/knowledge-storage.sql` and configure `SUPABASE_KNOWLEDGE_BUCKET=knowledge-sources`.

## Phase 2: Retrieval Trust

Status: implemented in the working tree; evaluation against production data remains required.

Implemented controls:

- Stable citations carrying document ID, chunk ID, source version, heading, and source URI.
- Conversation-aware deterministic query rewriting for follow-up questions.
- Dedicated reranker API with LLM fallback.
- Evidence-quality gating before knowledge is injected into the model prompt.
- Explicit prompt-injection boundaries that treat retrieved documents as untrusted data.
- Citation metadata delivered to the client alongside streamed answers.
- Citation metadata persisted with assistant chat messages for history reloads.

Validation command:

```bash
npm run test:retrieval-trust
```

## Phase 3: Agent Runtime

Planned after Phase 2 quality gates are established:

- LangGraph state machine for intent routing, retrieval, evidence validation, tool selection, and cited response generation.
- Typed allowlisted tools, idempotency keys, audit records, and explicit human approval for consequential actions.
- Durable graph checkpoints scoped by organization and conversation.

## Verification Policy

Every retrieval, prompt, reranker, embedding, or chunking change must run against a versioned evaluation set. Release gates should include retrieval Recall@K/MRR, citation correctness, faithfulness, unauthorized-access tests, latency, fallback rate, and model cost.
