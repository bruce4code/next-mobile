#!/usr/bin/env tsx
/**
 * Phase 0 parity checker: Ingestion output comparison
 *
 * Compares chunk counts, versions, offsets, and headings between two ingestion runs.
 * Usage:
 *   # Compare web processor against itself (sanity check)
 *   tsx scripts/parity/ingestion-parity.ts --mode=web-self
 *
 *   # Compare web vs Nest (Phase 1 acceptance)
 *   tsx scripts/parity/ingestion-parity.ts --mode=web-vs-nest --document-id=<id>
 */

import 'dotenv/config'
import prisma from '../../apps/web/src/lib/prisma'
import { processNextIngestionJob } from '../../apps/web/src/lib/ingestion'

interface ChunkSnapshot {
  chunkCount: number
  chunkingVersion: string
  parserVersion: string
  embeddingModel: string
  chunks: Array<{
    startOffset: number | null
    endOffset: number | null
    heading: string | null
  }>
}

async function captureChunks(documentId: string): Promise<ChunkSnapshot> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      parserVersion: true,
      chunkingVersion: true,
      embeddingModel: true,
    },
  })

  if (!document) {
    throw new Error(`Document ${documentId} not found`)
  }

  const chunks = await prisma.documentChunk.findMany({
    where: { documentId },
    select: {
      startOffset: true,
      endOffset: true,
      heading: true,
    },
    orderBy: { startOffset: 'asc' },
  })

  if (chunks.length === 0) {
    throw new Error(`No chunks found for document ${documentId}`)
  }

  return {
    chunkCount: chunks.length,
    chunkingVersion: document.chunkingVersion ?? 'unknown',
    parserVersion: document.parserVersion ?? 'unknown',
    embeddingModel: document.embeddingModel ?? 'unknown',
    chunks: chunks.map(c => ({
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      heading: c.heading,
    })),
  }
}

function compareSnapshots(a: ChunkSnapshot, b: ChunkSnapshot): string[] {
  const diffs: string[] = []

  if (a.chunkCount !== b.chunkCount) {
    diffs.push(`Chunk count mismatch: ${a.chunkCount} vs ${b.chunkCount}`)
  }
  if (a.chunkingVersion !== b.chunkingVersion) {
    diffs.push(`Chunking version: ${a.chunkingVersion} vs ${b.chunkingVersion}`)
  }
  if (a.parserVersion !== b.parserVersion) {
    diffs.push(`Parser version: ${a.parserVersion} vs ${b.parserVersion}`)
  }
  if (a.embeddingModel !== b.embeddingModel) {
    diffs.push(`Embedding model: ${a.embeddingModel} vs ${b.embeddingModel}`)
  }

  const minLength = Math.min(a.chunks.length, b.chunks.length)
  for (let i = 0; i < minLength; i++) {
    const ca = a.chunks[i]
    const cb = b.chunks[i]
    if (ca.startOffset !== cb.startOffset || ca.endOffset !== cb.endOffset) {
      diffs.push(`Chunk ${i} offset mismatch: [${ca.startOffset}, ${ca.endOffset}] vs [${cb.startOffset}, ${cb.endOffset}]`)
    }
    if (ca.heading !== cb.heading) {
      diffs.push(`Chunk ${i} heading: "${ca.heading}" vs "${cb.heading}"`)
    }
  }

  return diffs
}

async function main() {
  const mode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'web-self'

  console.log(`Running ingestion parity check (mode: ${mode})`)

  if (mode === 'web-self') {
    console.log('Testing: Process same document twice, compare results')
    console.log('Phase 0 acceptance: This mode should always pass (sanity check)\n')

    const testDoc = {
      userId: 'test-user-parity',
      title: 'Parity Test Document',
      content: 'This is a test.\n\n## Section 1\nContent here.\n\n## Section 2\nMore content.',
      contentType: 'text/plain',
      idempotencyKey: `parity-${Date.now()}`,
    }

    console.log('Enqueuing document...')
    const { enqueueDocumentIngestion } = await import('../../apps/web/src/lib/ingestion')
    const { document: doc1 } = await enqueueDocumentIngestion(testDoc)

    console.log('Processing job (run 1)...')
    await processNextIngestionJob()
    const snap1 = await captureChunks(doc1.id)

    console.log('Deleting chunks...')
    await prisma.documentChunk.deleteMany({ where: { documentId: doc1.id } })

    console.log('Re-enqueuing same document...')
    await prisma.ingestionJob.create({
      data: {
        documentId: doc1.id,
        userId: testDoc.userId,
        documentVersion: 1,
        operation: 'INDEX',
        idempotencyKey: `parity-rerun-${Date.now()}`,
      },
    })

    console.log('Processing job (run 2)...')
    await processNextIngestionJob()
    const snap2 = await captureChunks(doc1.id)

    const diffs = compareSnapshots(snap1, snap2)

    console.log('\n=== Results ===')
    console.log(`Snapshot 1: ${snap1.chunkCount} chunks`)
    console.log(`Snapshot 2: ${snap2.chunkCount} chunks`)

    if (diffs.length === 0) {
      console.log('✅ PASS: Identical output\n')
      process.exit(0)
    } else {
      console.log('❌ FAIL: Output differs:')
      diffs.forEach(d => console.log(`  - ${d}`))
      console.log()
      process.exit(1)
    }
  } else if (mode === 'web-vs-nest') {
    console.log('Phase 1 mode: Compare web vs Nest processor output')

    const NEST_API_URL = process.env.NEST_API_URL || 'http://localhost:4000'
    const INGESTION_WORKER_SECRET = process.env.INGESTION_WORKER_SECRET

    if (!INGESTION_WORKER_SECRET) {
      console.error('❌ INGESTION_WORKER_SECRET is required for web-vs-nest mode')
      process.exit(1)
    }

    const testDoc = {
      userId: 'test-user-parity-nest',
      title: 'Web vs Nest Test Document',
      content: 'Test content.\n\n## Heading 1\nSome text.\n\n## Heading 2\nMore text.',
      contentType: 'text/plain',
      idempotencyKey: `parity-nest-${Date.now()}`,
    }

    console.log('Creating test document for web processor...')
    const { enqueueDocumentIngestion } = await import('../../apps/web/src/lib/ingestion')
    const { document: docWeb } = await enqueueDocumentIngestion(testDoc)

    console.log('Processing via web...')
    await processNextIngestionJob()
    const webSnap = await captureChunks(docWeb.id)
    console.log(`Web result: ${webSnap.chunkCount} chunks`)

    console.log('\nCreating test document for Nest processor...')
    const { document: docNest } = await enqueueDocumentIngestion({
      ...testDoc,
      idempotencyKey: `parity-nest-2-${Date.now()}`,
    })

    console.log('Processing via Nest HTTP endpoint...')
    const nestUrl = `${NEST_API_URL}/api/ingestion/process`
    const response = await fetch(nestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INGESTION_WORKER_SECRET}`,
      },
      body: JSON.stringify({ limit: 1 }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ Nest endpoint failed: HTTP ${response.status}`)
      console.error(text)
      process.exit(1)
    }

    const nestSnap = await captureChunks(docNest.id)
    console.log(`Nest result: ${nestSnap.chunkCount} chunks`)

    const diffs = compareSnapshots(webSnap, nestSnap)

    console.log('\n=== Results ===')
    console.log(`Web:  ${webSnap.chunkCount} chunks, ${webSnap.chunkingVersion}/${webSnap.parserVersion}`)
    console.log(`Nest: ${nestSnap.chunkCount} chunks, ${nestSnap.chunkingVersion}/${nestSnap.parserVersion}`)

    if (diffs.length === 0) {
      console.log('✅ PASS: Web and Nest produce identical output\n')
      process.exit(0)
    } else {
      console.log('❌ FAIL: Output differs:')
      diffs.forEach(d => console.log(`  - ${d}`))
      console.log()
      process.exit(1)
    }
  } else {
    console.error(`Unknown mode: ${mode}`)
    process.exit(1)
  }
}

main()
  .catch(err => {
    console.error('Parity check failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())


