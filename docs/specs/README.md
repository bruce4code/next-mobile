# Spec-Driven Development

This directory contains specifications for cross-module, user-facing, data-changing, or operationally risky work.

Use a specification when a change affects one or more of these areas:

- API contracts, authentication, streaming, background jobs, or feature flags
- Prisma schema, database migrations, tenant isolation, or retention
- RAG retrieval, citations, evaluation, or model-provider behavior
- A workflow that spans Next.js, NestJS, and shared contracts

Small copy, styling, and isolated component changes do not require a specification.

## Workflow

1. Copy `TEMPLATE.md` to a numbered file, such as `003-feature-name.md`.
2. Agree on goals, non-goals, contract, acceptance criteria, and rollback before implementation.
3. Link implementation branches and commits in the specification.
4. Keep contracts in `packages/contracts`, schema changes in `prisma/`, and verification evidence in the specification.
5. Mark the specification complete only after its acceptance criteria and rollout conditions are met.

The migration record in `docs/next-nest-migration.md` remains the chronological log. A spec defines the intended behavior and acceptance bar for one change.
