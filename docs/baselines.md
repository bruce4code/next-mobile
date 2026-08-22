# Performance Baselines

Measured by `pnpm baseline -- [--target=web|nest] --count=N` (serial requests,
`useRAG: false`). Web is the pre-migration baseline; Phase 3 gates Nest's p50 at
within 20% of it.

## 2026-08-22 — /api/chat (target: web)

- Requests: 20/20 successful
- p50: 4905ms
- p95: 6722ms
- mean: 5193ms

Phase 3 bound for Nest: p50 ≤ 5886ms
