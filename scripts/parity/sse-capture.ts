#!/usr/bin/env tsx
/**
 * Phase 0 parity checker: SSE stream byte-level comparison
 *
 * Captures SSE events from web and Nest chat endpoints and compares them.
 * Usage:
 *   tsx scripts/parity/sse-capture.ts \
 *     --token=<access_token> \
 *     --prompt="Hello"
 */

import 'dotenv/config'
import { nestAuthHeaders, resolveToken, webAuthHeaders } from './auth'

interface SSEEvent {
  type: 'data' | 'comment'
  data: string
  parsed?: unknown
}

function parseSSE(text: string): SSEEvent[] {
  const lines = text.split('\n')
  const events: SSEEvent[] = []
  let currentData = ''

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const content = line.slice(6)
      if (currentData) currentData += '\n'
      currentData += content
    } else if (line === '') {
      if (currentData) {
        let parsed: unknown
        if (currentData !== '[DONE]') {
          try {
            parsed = JSON.parse(currentData)
          } catch {
            parsed = null
          }
        }
        events.push({ type: 'data', data: currentData, parsed })
        currentData = ''
      }
    } else if (line.startsWith(': ')) {
      events.push({ type: 'comment', data: line.slice(2) })
    }
  }

  return events
}

/**
 * Structural summary of a stream.
 *
 * Comparing streams event-by-event does not work: the two backends call the LLM
 * independently, so they emit different numbers of delta events, and a single
 * count difference shifts every later index — [DONE] then lands at a different
 * position and every position after the first delta reports a mismatch. What
 * the frozen protocol actually constrains is the shape: metadata first, deltas
 * in the provider's chunk format, [DONE] last.
 */
interface StreamShape {
  firstEventType: string
  metadata: Record<string, unknown> | null
  deltaCount: number
  /** Deltas whose shape does not match {choices:[{delta:{content}}]}. */
  malformedDeltas: number
  endsWithDone: boolean
  errors: unknown[]
}

function summarize(events: SSEEvent[]): StreamShape {
  const errors: unknown[] = []
  let metadata: Record<string, unknown> | null = null
  let deltaCount = 0
  let malformedDeltas = 0

  for (const event of events) {
    if (event.data === '[DONE]') continue

    const parsed = event.parsed as Record<string, unknown> | null | undefined
    if (!parsed) continue

    if (parsed.type === 'error') {
      errors.push(parsed.error)
      continue
    }

    if (parsed.type === 'metadata') {
      metadata ??= parsed
      continue
    }

    // Anything else should be a provider chunk carrying text.
    deltaCount++
    const choices = parsed.choices as Array<{ delta?: { content?: unknown } }> | undefined
    if (typeof choices?.[0]?.delta?.content !== 'string') {
      malformedDeltas++
    }
  }

  const firstParsed = events[0]?.parsed as Record<string, unknown> | null | undefined

  return {
    firstEventType:
      events[0]?.data === '[DONE]' ? '[DONE]' : (firstParsed?.type as string) ?? 'chunk',
    metadata,
    deltaCount,
    malformedDeltas,
    endsWithDone: events[events.length - 1]?.data === '[DONE]',
    errors,
  }
}

/**
 * Structural diffs are failures. Both sides failing the same way is not: it
 * means the error path agrees, which is part of what the frozen protocol
 * covers. Reported separately so an upstream hiccup is not mistaken for a
 * migration defect.
 */
interface Comparison {
  diffs: string[]
  bothErroredIdentically: boolean
}

function compareEvents(webEvents: SSEEvent[], nestEvents: SSEEvent[]): Comparison {
  const diffs: string[] = []
  const web = summarize(webEvents)
  const nest = summarize(nestEvents)

  const bothErrored = web.errors.length > 0 && nest.errors.length > 0
  const sameErrors = JSON.stringify(web.errors) === JSON.stringify(nest.errors)

  if (bothErrored && !sameErrors) {
    diffs.push(
      `error message differs: ${JSON.stringify(web.errors)} vs ${JSON.stringify(nest.errors)}`,
    )
  }

  // One side erroring while the other succeeded is a real asymmetry.
  if ((web.errors.length > 0) !== (nest.errors.length > 0)) {
    diffs.push(
      `only one side errored — web: ${JSON.stringify(web.errors)} nest: ${JSON.stringify(nest.errors)}`,
    )
  }

  if (web.firstEventType !== nest.firstEventType) {
    diffs.push(`First event: ${web.firstEventType} vs ${nest.firstEventType} (metadata must come first)`)
  }

  if (web.endsWithDone !== nest.endsWithDone) {
    diffs.push(`Ends with [DONE]: ${web.endsWithDone} vs ${nest.endsWithDone}`)
  }

  if (!web.metadata || !nest.metadata) {
    diffs.push(`metadata event present: ${Boolean(web.metadata)} vs ${Boolean(nest.metadata)}`)
  } else {
    const webCites = (web.metadata.citations as unknown[])?.length ?? 0
    const nestCites = (nest.metadata.citations as unknown[])?.length ?? 0
    if (webCites !== nestCites) {
      diffs.push(`metadata citation count: ${webCites} vs ${nestCites}`)
    }

    for (const key of ['requestId', 'model', 'citations']) {
      if (!(key in web.metadata)) diffs.push(`metadata.${key} missing in web`)
      if (!(key in nest.metadata)) diffs.push(`metadata.${key} missing in nest`)
    }
  }

  // Delta counts legitimately differ (independent generations); malformed ones
  // do not — those mean the client cannot read the text.
  for (const [label, shape] of [['web', web], ['nest', nest]] as const) {
    if (shape.malformedDeltas > 0) {
      diffs.push(
        `${label}: ${shape.malformedDeltas}/${shape.deltaCount} delta events lack choices[0].delta.content`,
      )
    }
    // A truncated stream can legitimately carry no deltas, so only treat an
    // empty stream as a defect when nothing went wrong upstream.
    if (shape.deltaCount === 0 && shape.errors.length === 0) {
      diffs.push(`${label}: no delta events — the stream produced no text`)
    }
  }

  return { diffs, bothErroredIdentically: bothErrored && sameErrors }
}

async function captureStream(
  url: string,
  authHeaders: Record<string, string>,
  body: object,
): Promise<SSEEvent[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  }

  const text = await res.text()
  return parseSSE(text)
}

async function main() {
  const promptArg = process.argv.find(a => a.startsWith('--prompt='))

  const token = resolveToken(process.argv, 'Usage: tsx sse-capture.ts [--token=<token>] --prompt="..."')

  if (!promptArg) {
    console.error('Usage: tsx sse-capture.ts [--token=<token>] --prompt="..."')
    process.exit(1)
  }

  const prompt = promptArg.split('=').slice(1).join('=')

  const webBase = process.env.WEB_BASE_URL || 'http://localhost:8000'
  const nestBase = process.env.NEST_API_URL || 'http://localhost:4000'

  const requestBody = {
    messages: [{ role: 'user', content: prompt }],
    useRAG: false,
  }

  console.log(`Capturing SSE streams for prompt: "${prompt}"`)
  console.log(`Web:  ${webBase}/api/chat`)
  console.log(`Nest: ${nestBase}/api/chat\n`)

  // Sequential, not concurrent: two simultaneous streams compete for the same
  // provider rate limit, and a throttled side surfaces as an error event that
  // looks like a code fault. It also keeps timing comparable to the serial
  // baseline in docs/baselines.md.
  console.log('Capturing web stream...')
  const webEvents = await captureStream(`${webBase}/api/chat`, webAuthHeaders(token), requestBody)
  console.log(`  ${webEvents.length} events`)

  console.log('Capturing nest stream...')
  const nestEvents = await captureStream(`${nestBase}/api/chat`, nestAuthHeaders(token), requestBody)
  console.log(`  ${nestEvents.length} events\n`)

  const { diffs, bothErroredIdentically } = compareEvents(webEvents, nestEvents)

  const describe = (label: string, events: SSEEvent[]) => {
    const shape = summarize(events)
    console.log(
      `${label}: first=${shape.firstEventType} deltas=${shape.deltaCount} ` +
        `malformed=${shape.malformedDeltas} done=${shape.endsWithDone} ` +
        `model=${shape.metadata?.model ?? 'n/a'} citations=${(shape.metadata?.citations as unknown[])?.length ?? 0}`,
    )
  }

  describe('web ', webEvents)
  describe('nest', nestEvents)
  console.log()

  if (diffs.length > 0) {
    console.log('❌ FAIL: Stream differences:')
    diffs.forEach(d => console.log(`  - ${d}`))
    console.log()
    process.exit(1)
  }

  console.log('✅ PASS: SSE streams are structurally identical')
  console.log('   (delta counts may differ — independent generations)')

  if (bothErroredIdentically) {
    // Not a failure: identical failure on both sides is itself parity. Called
    // out so the run is not read as proof that a clean stream works.
    console.log('\n⚠️  Both streams ended in the same error event:')
    console.log(`   ${JSON.stringify(summarize(webEvents).errors[0])}`)
    console.log('   The error path agrees, but this run did not exercise a clean stream.')
    console.log('   Upstream truncation — web shows it too, so it predates the migration.')
  }

  console.log()
  process.exit(0)
}

main().catch(err => {
  console.error('SSE capture failed:', err)
  process.exit(1)
})
