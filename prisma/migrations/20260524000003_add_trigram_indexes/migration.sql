-- Enable pg_trgm extension for trigram-based ILIKE index
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for DocumentChunk ILIKE keyword search
-- The hybrid search uses: dc.title ILIKE ANY($likePatterns) OR dc.content ILIKE ANY($likePatterns)
-- These indexes prevent sequential scans as the DocumentChunk table grows
CREATE INDEX IF NOT EXISTS "DocumentChunk_title_trgm_idx"
ON "DocumentChunk"
USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "DocumentChunk_content_trgm_idx"
ON "DocumentChunk"
USING gin (content gin_trgm_ops);

-- GIN trigram indexes for Document fallback search
-- The fallback query uses: dc.title ILIKE $pattern OR dc.content ILIKE $pattern
CREATE INDEX IF NOT EXISTS "Document_title_trgm_idx"
ON "Document"
USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Document_content_trgm_idx"
ON "Document"
USING gin (content gin_trgm_ops);