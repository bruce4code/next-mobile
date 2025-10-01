# Repository Guidelines

## Project Structure & Module Organization
The project uses the Next.js App Router. Route handlers and pages live in `src/app`, with locale-aware routing under `src/app/[locale]` and API handlers in `src/app/api`. Shared UI sits in `src/components`; primitives from `src/components/ui` mirror the shadcn patterns, while feature wrappers such as `AppSidebar.tsx` and `LoginForm.tsx` compose them. Client hooks belong in `src/hooks`, and cross-cutting services (Prisma client, Supabase utilities, caching, i18n) reside in `src/lib`. Database schema and migrations are versioned under `prisma/`, and static assets belong in `public/`.

## Build, Test, and Development Commands
Run `npm run dev` (or `pnpm dev`) for a local development server with hot reload. Use `npm run build` to produce a production bundle and surface type-check issues. Start a compiled build with `npm run start`. Enforce lint rules before raising a PR via `npm run lint`; this runs the ESLint configuration in `eslint.config.mjs`.

## Coding Style & Naming Conventions
Code is TypeScript-first; prefer `.tsx` React components with top-level `"use client"` directives only when needed. Keep two-space indentation, double-quoted strings, and trailing commas consistent with the existing formatting. Components and hooks follow PascalCase filenames (e.g., `UserProvider.tsx`, `useMobile.ts`), while utility modules use camelCase. Tailwind classes should favor composable utility-first styling; share variants through `class-variance-authority` when patterns repeat.

## Testing Guidelines
Automated tests are not yet wired up, so document manual verification steps in your PR. When introducing a test harness, colocate specs as `<module>.test.ts` beside the implementation and run them in CI. At minimum, ensure new logic passes `npm run lint` and validate critical flows such as authentication, chat history loading, and locale switching before submitting.

## Commit & Pull Request Guidelines
Follow the existing conventional commit style (`feat(scope): concise summary`) visible in `git log`. Each PR should include: a focused summary, screenshots or GIFs for UI changes, notes on database migrations, and an explicit list of local commands run. Link relevant issues and call out any follow-up work so reviewers can plan next steps.

## Data & Configuration Tips
Secrets for Supabase, Prisma, and OpenAI belong in `.env.local`; never commit them. After updating `prisma/schema.prisma`, regenerate the client with `npx prisma generate` and document required migrations. When adjusting caching or localization settings, keep the corresponding helpers in `src/lib/cache.ts` and `src/lib/i18n.server.ts` synchronized with the new behavior.
