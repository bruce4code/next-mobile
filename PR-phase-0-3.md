# Migration 005: Next to Nest service migration (Phase 0-3)

## 🎯 Overview

This PR completes **Phase 0-3** of spec 005: migrating services from Next.js API routes to a standalone Nest.js backend.

---

## 📦 What's included

### Phase 0 — Baseline repair
- ✅ Fixed worker import paths
- ✅ Created parity test harness (4 scripts)
- ✅ Established spec 005 foundation

### Phase 1 — Ingestion cutover
- ✅ `INGESTION_BACKEND` flag (web|nest, default web)
- ✅ Worker HTTP poller mode
- ✅ **Parity test passes**: web vs Nest produce identical chunks

### Phase 2 — Non-streaming API cutover
- ✅ 5 new Nest modules: users, chat-history, feedback, ingestion-jobs, documents
- ✅ CORS configuration with WEB_ORIGINS whitelist
- ✅ Extended contract schemas (UserProfile, ChatHistory, Feedback, Documents, IngestionJobs)
- ✅ 4 backend flags: USER_BACKEND, CHAT_HISTORY_BACKEND, FEEDBACK_BACKEND, DOCUMENTS_BACKEND

### Phase 3 — Streaming chat cutover
- ✅ Chat SSE streaming endpoint (POST /api/chat)
- ✅ LangSmith tracing integration (`wrapOpenAI` + metadata)
- ✅ RAG citations extraction (id, title, score, offsets)
- ✅ Supabase storage helpers (per-request RLS client)
- ✅ `CHAT_BACKEND` flag

---

## 🔧 Technical highlights

**Nest API endpoints (15 total):**
```
GET  /api/health
GET  /api/auth/me
POST /api/retrieval/prepare-context
POST /api/retrieval/search
POST /api/ingestion/process
GET  /api/users/me
PUT  /api/users/me
GET  /api/chat-history
POST /api/chat (SSE streaming)
POST /api/feedback
GET  /api/ingestion-jobs/:id
GET  /api/documents
POST /api/documents
PUT  /api/documents/:id
DELETE /api/documents/:id
```

**Infrastructure:**
- CORS configured for browser-direct requests
- Supabase JWT authentication on all endpoints
- LangSmith automatic tracing
- OpenRouter API integration
- RAG retrieval with hybrid search

---

## ✅ Verification

**Build & start:**
```bash
pnpm --filter @ai-arg/api build  # ✅ passes
pnpm --filter @ai-arg/api start:dev  # ✅ starts on :4000
```

**Parity tests:**
```bash
pnpm parity:ingestion -- --mode=web-self       # ✅ PASS
pnpm parity:ingestion -- --mode=web-vs-nest    # ✅ PASS
```

**CORS preflight:**
```bash
curl -X OPTIONS http://localhost:4000/api/users/me -H "Origin: http://localhost:3000"
# ✅ Returns correct Access-Control-* headers
```

**Auth guard:**
```bash
curl http://localhost:4000/api/chat
# ✅ Returns 401 Unauthorized (as expected)
```

---

## 📋 What's NOT in this PR

**Phase 4 (deferred to next PR):**
- Web frontend reading `*_BACKEND` flags
- Switching API calls to Nest
- Gradual rollout logic

**Tests requiring valid tokens (deferred):**
- SSE parity test (web vs nest streaming)
- Latency baseline capture
- Round-trip tests for all endpoints

**Minor optimizations (deferred):**
- Supabase storage deletion implementation (placeholder exists)
- Additional error handling refinements

---

## 🔍 Review notes

**Key files to review:**
- `docs/specs/005-next-to-nest-service-migration.md` — full spec with acceptance criteria
- `apps/api/src/chat/chat.service.ts` — SSE streaming + RAG + LangSmith
- `apps/api/src/ingestion/ingestion.controller.ts` — worker endpoint
- `packages/config/src/index.ts` — 5 backend flags
- `scripts/ingestion-worker.ts` — dual-mode HTTP poller

**Migration path:**
All backend flags default to `web`, so this PR is **safe to merge** without immediate changes to production. Phase 4 will gradually switch flags to `nest` per-service.

---

## 📊 Stats

- **12 commits** across Phase 0-3
- **40+ files** modified/added
- **15 endpoints** implemented
- **0 breaking changes** (all flags default to existing behavior)

---

## 🚀 Next steps after merge

1. **Phase 4 PR**: Implement web-side flag reading & API switching
2. **Staging validation**: Deploy to staging, test with real tokens
3. **Gradual rollout**: Enable Nest backend per-user with feature flags
4. **Monitoring**: Set up metrics for Nest vs web performance comparison

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
