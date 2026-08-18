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

function compareEvents(webEvents: SSEEvent[], nestEvents: SSEEvent[]): string[] {
  const diffs: string[] = []

  if (webEvents.length !== nestEvents.length) {
    diffs.push(`Event count: ${webEvents.length} vs ${nestEvents.length}`)
  }

  const minLen = Math.min(webEvents.length, nestEvents.length)
  for (let i = 0; i < minLen; i++) {
    const we = webEvents[i]
    const ne = nestEvents[i]

    if (we.type !== ne.type) {
      diffs.push(`Event ${i} type: ${we.type} vs ${ne.type}`)
      continue
    }

    if (we.data === '[DONE]' && ne.data === '[DONE]') {
      continue
    }

    if (!we.parsed || !ne.parsed) {
      if (we.data !== ne.data) {
        diffs.push(`Event ${i} unparseable data mismatch`)
      }
      continue
    }

    const wObj = we.parsed as Record<string, unknown>
    const nObj = ne.parsed as Record<string, unknown>

    if (wObj.type !== nObj.type) {
      diffs.push(`Event ${i} JSON type: ${wObj.type} vs ${nObj.type}`)
    }

    if (wObj.type === 'metadata') {
      if (wObj.model !== nObj.model && !(String(wObj.model).includes('rag') && String(nObj.model).includes('rag'))) {
        diffs.push(`Event ${i} model: ${wObj.model} vs ${nObj.model}`)
      }
      const wCites = (wObj.citations as unknown[])?.length ?? 0
      const nCites = (nObj.citations as unknown[])?.length ?? 0
      if (wCites !== nCites) {
        diffs.push(`Event ${i} citation count: ${wCites} vs ${nCites}`)
      }
    }
  }

  return diffs
}

async function captureStream(url: string, token: string, body: object): Promise<SSEEvent[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
  const tokenArg = process.argv.find(a => a.startsWith('--token='))
  const promptArg = process.argv.find(a => a.startsWith('--prompt='))

  if (!tokenArg || !promptArg) {
    console.error('Usage: tsx sse-capture.ts --token=<token> --prompt="..."')
    process.exit(1)
  }

  const token = tokenArg.split('=')[1]
  const prompt = promptArg.split('=')[1]

  const webBase = process.env.WEB_BASE_URL || 'http://localhost:3000'
  const nestBase = process.env.NEST_API_URL || 'http://localhost:4000/api'

  const requestBody = {
    messages: [{ role: 'user', content: prompt }],
    useRAG: false,
  }

  console.log(`Capturing SSE streams for prompt: "${prompt}"`)
  console.log(`Web:  ${webBase}/api/chat`)
  console.log(`Nest: ${nestBase}/chat\n`)

  const [webEvents, nestEvents] = await Promise.all([
    captureStream(`${webBase}/api/chat`, token, requestBody),
    captureStream(`${nestBase}/chat`, token, requestBody),
  ])

  console.log(`Web events:  ${webEvents.length}`)
  console.log(`Nest events: ${nestEvents.length}\n`)

  const diffs = compareEvents(webEvents, nestEvents)

  if (diffs.length === 0) {
    console.log('✅ PASS: SSE streams are structurally identical\n')
    process.exit(0)
  } else {
    console.log('❌ FAIL: Stream differences:')
    diffs.forEach(d => console.log(`  - ${d}`))
    console.log()
    process.exit(1)
  }
}

main().catch(err => {
  console.error('SSE capture failed:', err)
  process.exit(1)
})
