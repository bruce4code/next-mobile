# Backend Routing Usage Guide

## Overview

This project uses a dual-backend architecture with feature flags to gradually migrate from Next.js API routes to a standalone Nest.js backend.

## Environment Variables

All backend flags default to `"web"` for backward compatibility.

```bash
# .env.local or deployment environment
NEXT_PUBLIC_NEST_API_URL=http://localhost:4000  # Nest API base URL

# Backend flags (all default to "web")
NEXT_PUBLIC_INGESTION_BACKEND=web
NEXT_PUBLIC_USER_BACKEND=web
NEXT_PUBLIC_CHAT_HISTORY_BACKEND=web
NEXT_PUBLIC_CHAT_BACKEND=web
NEXT_PUBLIC_FEEDBACK_BACKEND=web
NEXT_PUBLIC_DOCUMENTS_BACKEND=web
```

## Server-side Usage

### API Routes (Proxies)

API routes automatically proxy to the correct backend based on flags:

```typescript
// apps/web/src/app/api/chat/route.ts
import { backendConfig } from "@/lib/backend-config"

export async function POST(req: Request) {
  if (backendConfig.chat === "web") {
    // Use original Next.js implementation
    const { POST: webPost } = await import("./route.web")
    return webPost(req)
  }

  // Proxy to Nest backend
  // (auth token automatically injected)
  // ...
}
```

**No code changes needed for existing API routes** — proxies handle routing transparently.

## Client-side Usage

### Option 1: Use API Routes (Recommended)

Continue using existing API routes — they auto-route based on flags:

```typescript
// Existing code works unchanged
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages }),
})
```

### Option 2: Direct Backend Calls

For new code that needs direct backend access:

```typescript
import { apiFetch } from '@/lib/api-client'

// Automatically routes to correct backend + injects auth token
const response = await apiFetch('user', '/users/me')
const user = await response.json()

// Or with custom options
const response = await apiFetch('chat', '/chat', {
  method: 'POST',
  body: JSON.stringify({ messages }),
})
```

### Option 3: Manual Routing

For advanced use cases:

```typescript
import { getApiUrl, backendConfig } from '@/lib/backend-config'

const backend = backendConfig.chat
const url = getApiUrl('chat', '/chat')

// url will be:
// - "" (empty) for web → uses Next.js API routes
// - "http://localhost:4000" for nest → direct Nest call
```

## Testing Backend Switches

### Local Development

```bash
# Test with Nest backend
NEXT_PUBLIC_CHAT_BACKEND=nest pnpm dev

# Start Nest API separately
pnpm --filter @ai-arg/api start:dev

# Test chat endpoint
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

### Deployment

```yaml
# Vercel deployment
NEXT_PUBLIC_NEST_API_URL=https://nest-api.example.com
NEXT_PUBLIC_CHAT_BACKEND=nest
NEXT_PUBLIC_FEEDBACK_BACKEND=nest
# ... other flags as needed
```

## Gradual Rollout

### Phase 1: Canary Testing (Internal Users)

```bash
# Enable Nest for specific users only
NEXT_PUBLIC_CHAT_BACKEND=web  # Default
# Custom logic in middleware to override per-user
```

### Phase 2: Percentage Rollout

```typescript
// Example: 20% of users → Nest, 80% → Web
function getUserBackend(userId: string): Backend {
  const rolloutPercentage = Number(process.env.NEST_ROLLOUT_PERCENTAGE) || 0
  const hash = hashUserId(userId) // Consistent hash
  return (hash % 100) < rolloutPercentage ? 'nest' : 'web'
}
```

### Phase 3: Full Cutover

```bash
# Switch all traffic to Nest
NEXT_PUBLIC_CHAT_BACKEND=nest
NEXT_PUBLIC_FEEDBACK_BACKEND=nest
# ... etc
```

## Monitoring

### Key Metrics

1. **Response Time**
   - Track p50, p95, p99 latency per backend
   - Compare web vs nest for same endpoint

2. **Error Rate**
   - Monitor 4xx/5xx rates per backend
   - Alert on increased error rates after switch

3. **Request Volume**
   - Track requests routed to each backend
   - Verify rollout percentages

### Logging

```typescript
// Backend routing is logged automatically
console.log({
  event: 'API.Routed',
  service: 'chat',
  backend: backendConfig.chat,
  url: nestUrl,
})
```

## Rollback Plan

### Immediate Rollback

```bash
# In deployment environment, set flag back to web
NEXT_PUBLIC_CHAT_BACKEND=web
# Redeploy or restart (depends on deployment method)
```

### Gradual Rollback

```bash
# Reduce rollout percentage
NEST_ROLLOUT_PERCENTAGE=10  # From 50% → 10%
```

### Emergency Kill Switch

```typescript
// Add to middleware or API route
if (process.env.EMERGENCY_DISABLE_NEST === 'true') {
  return { ...backendConfig, chat: 'web', feedback: 'web', /* ... */ }
}
```

## Troubleshooting

### "Cannot connect to Nest API"

- Check `NEXT_PUBLIC_NEST_API_URL` is correct
- Verify Nest API is running: `curl http://localhost:4000/api/health`
- Check network connectivity between web and Nest

### "401 Unauthorized from Nest"

- Verify Supabase token is being injected
- Check token expiration
- Verify Nest auth guard configuration

### "Different response from Nest vs Web"

Run the parity scripts (from repo root):

```bash
# Ingestion: compares chunk output written to the DB
pnpm parity:ingestion -- --mode=web-vs-nest

# JSON endpoints: compares response bodies for the same token
pnpm parity:endpoint -- --service=user --token=<token>
pnpm parity:endpoint -- --service=chat-history --token=<token>

# Chat SSE: compares event sequence and shapes
pnpm parity:sse -- --token=<token> --prompt="hello"
```

Then:
- Check contract schemas match between web and Nest
- Review Nest implementation vs web implementation

Note: `parity:endpoint` takes `--service` (not a raw path) because web and
Nest use different URLs for the same capability — the pairs are defined in
`scripts/parity/endpoint-roundtrip.ts`.

### Comparing latency

```bash
# Web baseline (pre-migration reference)
pnpm baseline -- --count=20

# Nest, compared against the recorded web p50
pnpm baseline -- --target=nest --count=20
```

Both write to `docs/baselines.md`. The Nest run reports whether its p50 is
within the Phase 3 bound (web p50 + 20%). Requests are serial, so run these
while nothing else is driving the same provider — a run whose success rate falls
below 80% is rejected rather than recorded, since a p50 computed from a handful
of survivors looks normal but means nothing.

## Examples

### Example 1: Chat with SSE Streaming

```typescript
// Client-side
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages }),
})

// Response is SSE stream from either web or nest
const reader = response.body!.getReader()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  // Process SSE event
}
```

### Example 2: User Profile Update

```typescript
import { apiFetch } from '@/lib/api-client'

async function updateProfile(data: { name?: string }) {
  const response = await apiFetch('user', '/users/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error('Update failed')
  }

  return response.json()
}
```

### Example 3: Feedback Submission

```typescript
// Existing code works unchanged
await fetch('/api/feedback', {
  method: 'POST',
  body: JSON.stringify({
    requestId: '...',
    score: 1,
    comment: 'Great response!',
  }),
})
```

## Best Practices

1. **Always use proxies** — Don't bypass API routes unless necessary
2. **Test both backends** — Run tests with both web and nest flags
3. **Monitor carefully** — Watch metrics during rollout
4. **Rollout gradually** — Start with internal users, then percentage
5. **Have rollback ready** — Keep web implementation working
6. **Document issues** — Track any differences between backends

## Migration Checklist

Per endpoint migration:

- [ ] Nest endpoint implemented
- [ ] Contract schemas match
- [ ] Parity test passes
- [ ] Proxy route created
- [ ] Local testing with nest flag
- [ ] Staging deployment
- [ ] Internal user testing
- [ ] 10% rollout
- [ ] 50% rollout
- [ ] 100% rollout
- [ ] Remove web implementation (optional)

---

**Documentation version:** Phase 4  
**Last updated:** 2026-08-18
