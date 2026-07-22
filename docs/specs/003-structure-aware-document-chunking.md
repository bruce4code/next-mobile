# 003 Structure-Aware Document Chunking

Status: Draft

## Goal

Replace the current character-first document chunking with deterministic, structure-aware chunking. A chunk must preserve meaningful Markdown and plain-text boundaries where possible, stay within a token budget, and never split a Markdown table or fenced code block. The change must preserve the existing asynchronous ingestion, tenant isolation, citation offsets, and retrieval contracts.

## Non-goals

- This phase does not use an LLM or embedding similarity to identify semantic boundaries.
- This phase does not add PDF, DOCX, PPTX, XLSX, or image/OCR parsing. It operates on the text or Markdown already stored in `Document.content`.
- This phase does not change vector search, keyword search, RRF, reranking, chat prompting, or citation response shapes.
- This phase does not introduce parent-child retrieval. It preserves enough metadata to support that work later.

## Current State

`apps/web/src/lib/chunking.ts` uses `MarkdownTextSplitter` for Markdown and `RecursiveCharacterTextSplitter` for other text. Both are configured with `chunkSize: 300` and `chunkOverlap: 50`, which are character counts. Chunks persist a local heading, ordinal index, and source offsets in `DocumentChunk`.

The current strategy can split a logical paragraph, procedure, table, or code example solely because it crosses the character boundary. Character counts also do not provide a stable budget for embedding and model context use across Chinese and English documents.

## Design

### Ownership And Flow

The Next ingestion worker remains the owner of chunk creation:

1. A document is queued through the existing document API.
2. `processClaimedJob` passes the stored title, content, and content type to `chunkDocument`.
3. `chunkDocument` normalizes line endings and creates ordered structural units.
4. Units are packed into chunks up to the token budget, with a bounded overlap made from complete safe units.
5. The existing worker creates embeddings and writes `DocumentChunk` records transactionally.

No browser, API, Nest retrieval, or chat contract changes in this phase.

### Structural Units

`chunkDocument` must create units before applying a size budget.

- Markdown heading: begin a new section and retain the full heading path, from H1 through H4, for its descendant content.
- Paragraph: preserve as an atomic unit unless it alone exceeds the hard maximum.
- List: preserve consecutive list items as a unit where they fit; if oversized, split only between complete list items.
- Fenced code block: preserve the opening fence, content, and closing fence in one unit. An oversized code block may exceed the preferred target but must not be split.
- Markdown table: preserve the header, delimiter row, and all body rows in one unit. An oversized table may exceed the preferred target but must not be split.
- Plain text: split into paragraphs, then sentences. Sentences are the final preferred boundary before a hard character fallback.

If a single paragraph or sentence exceeds the hard maximum, use a recursive character split only for that unit. The fallback must keep the original heading path and set a metadata marker indicating that the unit was force-split.

### Token Budget And Overlap

The initial configuration is deliberately conservative and must be configurable through environment variables:

- `RAG_CHUNK_TARGET_TOKENS`: default `500`. Preferred maximum for a normal chunk.
- `RAG_CHUNK_MAX_TOKENS`: default `650`. Hard maximum for ordinary text, paragraphs, list items, and sentence groups.
- `RAG_CHUNK_OVERLAP_TOKENS`: default `80`. Maximum overlap, built from complete trailing safe units only.
- `RAG_CHUNK_MIN_TOKENS`: default `100`. Chunks below this target should merge with an adjacent compatible chunk when doing so stays within the target budget.

The token estimator must be deterministic, local, and provider-independent. It may use a tokenizer compatible with the configured embedding model; until one is adopted, use a documented heuristic for Chinese and Latin text and expose it only as an estimate. A chunk is not rejected merely because an indivisible table or fenced code block exceeds `RAG_CHUNK_MAX_TOKENS`; it is persisted intact and marked as oversized.

Overlap must never duplicate a partial table, a partial fenced code block, or a fragment of a sentence. Markdown heading text may be repeated as contextual metadata rather than copied into `content`.

### Chunk Metadata

The existing fields remain authoritative:

- `title`: document title plus the complete heading path when present.
- `content`: the exact chunk body, including intact tables and fenced code blocks.
- `chunkIndex`, `startOffset`, and `endOffset`: ordered source provenance.
- `heading`: the nearest heading, retained for backward compatibility.

Add the following optional metadata properties in `DocumentChunk.metadata`; no Prisma schema migration is required because the field is JSON:

- `headingPath: string[]`
- `estimatedTokens: number`
- `unitTypes: string[]`
- `oversized: boolean`
- `forceSplit: boolean`
- `chunkingVersion: string`

`CHUNKING_VERSION` must change when this strategy is released so that existing documents can be identified and reindexed. `PARSER_VERSION` remains unchanged because parsing is out of scope.

### Offset Rules

Offsets refer to the normalized source string used for chunking. Normalization must be stable and limited to line-ending conversion (`\r\n` and `\r` to `\n`). The stored document content must either use the same normalized form before ingestion or the implementation must map offsets back to the original content. A chunk whose exact source range cannot be determined must store `null` offsets and emit a structured warning; it must not store an incorrect range.

### Compatibility And Reindexing

Existing rows are not changed in place. Newly created or edited documents use the new version after rollout. Reindexing deletes only that document's existing chunks in the existing transaction and writes the new set, as it does today.

The first production rollout must include an operator-triggered backfill plan for documents with an older `chunkingVersion`. Backfill must be rate-limited through the existing ingestion job queue, be idempotent per document version, and be reversible by restoring the prior chunking configuration and reindexing affected documents.

## Contract

The external document API and chat retrieval API remain unchanged.

Internal `Chunk` output expands to include the metadata needed to populate `DocumentChunk.metadata`. `chunkDocument(title, content, contentType)` must remain asynchronous and retain its current ordered return contract so `processClaimedJob` continues to embed and persist chunks without a caller change beyond consuming the added metadata.

Supported content types for this phase remain `text` and `markdown`. Unknown content types must use the plain-text strategy and be logged at warning level.

Invalid chunk configuration values must fall back to defaults, be logged once at worker startup, and never cause an ingestion job to fail solely due to configuration parsing.

## Data And Security

This work changes only chunk boundaries and JSON metadata. It does not add raw prompt storage, external calls, or cross-user data access.

- All chunk creation continues to run after the document has been selected by `documentId` and `userId` in the ingestion worker.
- Chunks retain the document relation with cascade deletion.
- Heading paths, token estimates, and unit types may contain source-derived document structure and are therefore subject to the same tenant isolation and retention rules as `Document.content`.
- No migration is required for the metadata keys. A migration is required only if a future parent-child retrieval design adds typed columns or relations.

## Feature Flags And Rollback

- `RAG_CHUNKING_STRATEGY=legacy|structure-aware`; default `legacy` until validation succeeds.
- `RAG_CHUNKING_STRATEGY=structure-aware` applies only to newly indexed and explicitly reindexed documents.
- The token-budget environment variables apply only when `structure-aware` is selected.
- Rollback: set `RAG_CHUNKING_STRATEGY=legacy`, restart the ingestion worker, and reindex documents that were indexed with the new strategy if retrieval quality regresses. Existing chunks remain queryable during rollback.

## Acceptance Criteria

- Markdown headings produce a complete heading path in chunk metadata and a title that includes that path.
- A Markdown table is never split between its header, delimiter row, and body rows.
- A fenced code block is never split between opening and closing fences.
- Normal paragraphs and sentence groups do not exceed `RAG_CHUNK_MAX_TOKENS`; only indivisible tables and code blocks may exceed it, and they are marked `oversized: true`.
- Overlap contains only complete safe units and is at or below `RAG_CHUNK_OVERLAP_TOKENS` according to the selected estimator.
- A long plain-text paragraph is split on sentence boundaries before character fallback; fallback chunks carry `forceSplit: true`.
- Every chunk is returned in source order. Valid chunks have accurate start/end offsets against the normalized source; unresolved offsets are `null` and logged.
- An ingestion job continues to write chunk embeddings, source version, parser version, chunking version, and final `READY` status atomically.
- Existing retrieval and citation contract tests continue to pass without changes to their public response shape.
- A fixture suite covers Chinese and English prose, nested Markdown headings, lists, tables, fenced code, an oversized indivisible unit, and duplicate paragraph text.
- Before enabling the strategy by default, a representative evaluation set shows no decrease in Top-5 retrieval recall and no more than a 20% increase in median embedding input tokens per indexed document.

## Implementation Plan

1. Add deterministic structural-unit parsing and token-estimation helpers with fixture tests.
2. Add strategy selection and validated configuration loading.
3. Extend `Chunk` and persistence metadata, then bump `CHUNKING_VERSION`.
4. Add worker logs and a reindex/backfill runbook with rate limits.
5. Run offline retrieval evaluation against legacy chunks, then enable the feature flag for a small internal document cohort.
6. Promote to the default only after the acceptance thresholds hold; retain legacy rollback for one release cycle.

## Implementation Record

- Branch: pending
- Commits: pending
- Commands run: pending
- Manual verification: pending

## Open Questions

- Which tokenizer should become the production estimator for `Qwen/Qwen3-Embedding-8B`, and can it run in the worker without a network dependency?
- Should a table with thousands of rows remain one oversized chunk, or should a later table-specific strategy duplicate the header and split only at row boundaries?
- What document cohort and sample size are required for the offline retrieval gate?
- Should the future parent-child retrieval design use JSON heading paths only, or add a typed `sectionId` / `parentChunkId` relation?
