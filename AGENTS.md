# Repository Guidelines

## Project Structure & Module Organization
The project uses the Next.js App Router. Route handlers and pages live in `src/app`, with locale-aware routing under `src/app/[locale]` and API handlers in `src/app/api`. Shared UI sits in `src/components`; primitives from `src/components/ui` mirror the shadcn patterns, while feature wrappers such as `AppSidebar.tsx` and `LoginForm.tsx` compose them. Client hooks belong in `src/hooks`, and cross-cutting services (Prisma client, Supabase utilities, caching, i18n) reside in `src/lib`. Database schema and migrations are versioned under `prisma/`, and static assets belong in `public/`.

## Build, Test, and Development Commands
Run `npm run dev` (or `pnpm dev`) for a local development server with hot reload. Use `npm run build` to produce a production bundle and surface type-check issues. Start a compiled build with `npm run start`. Enforce lint rules before raising a PR via `npm run lint`; this runs the ESLint configuration in `eslint.config.mjs`.

## Coding Style & Naming Conventions
Code is TypeScript-first; prefer `.tsx` React components with top-level `"use client"` directives only when needed. Keep two-space indentation, double-quoted strings, and trailing commas consistent with the existing formatting. Components and hooks follow PascalCase filenames (e.g., `UserProvider.tsx`, `useMobile.ts`), while utility modules use camelCase. Tailwind classes should favor composable utility-first styling; share variants through `class-variance-authority` when patterns repeat.

## Testing Guidelines
Automated tests are not yet wired up, so document manual verification steps in your PR. When introducing a test harness, colocate specs as `<module>.test.ts` beside the implementation and run them in CI. At minimum, ensure new logic passes `npm run lint` and validate critical flows such as authentication, chat history loading, and locale switching before submitting.

## Spec-Driven Development
Follow the spec-driven workflow in `docs/specs/README.md`. Every change that touches API contracts, authentication, streaming, background jobs, feature flags, the Prisma schema, database migrations, tenant isolation, RAG retrieval, citations, evaluation, model-provider behavior, or a workflow spanning Next.js + NestJS + shared contracts MUST carry the necessary specification update in the same change:

- If a numbered spec in `docs/specs/` already covers the change, update it: keep `Status`, acceptance criteria, and the implementation record (commits, commands run, verification evidence) consistent with what was actually built. Note any parity gaps and pending verification explicitly.
- If no spec covers a spec-worthy change, create a numbered spec from `docs/specs/TEMPLATE.md` and agree goals, non-goals, contract, acceptance criteria, and rollback before implementation.
- For migration work, keep the chronological record in `docs/next-nest-migration.md` in sync with the affected specs.
- Small copy, styling, and isolated component changes do not require a specification.

## Commit & Pull Request Guidelines
Follow the existing conventional commit style (`feat(scope): concise summary`) visible in `git log`. Each PR should include: a focused summary, screenshots or GIFs for UI changes, notes on database migrations, and an explicit list of local commands run. Link relevant issues and call out any follow-up work so reviewers can plan next steps.

## Data & Configuration Tips
Secrets for Supabase, Prisma, and OpenAI belong in `.env.local`; never commit them. After updating `prisma/schema.prisma`, regenerate the client with `npx prisma generate` and document required migrations. When adjusting caching or localization settings, keep the corresponding helpers in `src/lib/cache.ts` and `src/lib/i18n.server.ts` synchronized with the new behavior.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **next-mobile** (1385 symbols, 2162 relationships, 63 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/next-mobile/context` | Codebase overview, check index freshness |
| `gitnexus://repo/next-mobile/clusters` | All functional areas |
| `gitnexus://repo/next-mobile/processes` | All execution flows |
| `gitnexus://repo/next-mobile/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
