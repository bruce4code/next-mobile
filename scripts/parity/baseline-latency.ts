#!/usr/bin/env tsx
/**
 * Latency measurement for /api/chat, against web or nest.
 *
 * Web is the pre-migration baseline; nest is the comparison Phase 3 gates on
 * (Nest p50 within 20% of the web p50). Requests are serial so the two targets
 * are measured the same way and neither contends with itself for the provider
 * rate limit.
 *
 *   pnpm baseline -- --count=20                 # web (baseline)
 *   pnpm baseline -- --target=nest --count=20   # nest (comparison)
 */

import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { nestAuthHeaders, resolveToken, webAuthHeaders } from './auth'

type Target = 'web' | 'nest'

interface LatencyMeasurement {
  timestamp: string
  target: Target
  endpoint: string
  attempted: number
  succeeded: number
  p50Ms: number
  p95Ms: number
  meanMs: number
}

async function measureLatency(
  url: string,
  headers: Record<string, string>,
  count: number,
): Promise<number[]> {
  const latencies: number[] = []
  const body = JSON.stringify({
    messages: [{ role: 'user', content: 'Hello' }],
    useRAG: false,
    conversationId: randomUUID(),
  })

  for (let i = 0; i < count; i++) {
    const start = Date.now()
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    })

    if (!res.ok) {
      console.warn(`Request ${i + 1} failed: ${res.status}`)
      continue
    }

    await res.text()
    const elapsed = Date.now() - start
    latencies.push(elapsed)

    console.log(`Request ${i + 1}/${count}: ${elapsed}ms`)
  }

  return latencies
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

/** Previously recorded web p50, used to report the Phase 3 bound. */
function readWebBaselineP50(path: string): number | null {
  if (!existsSync(path)) return null
  const matches = [...readFileSync(path, 'utf-8').matchAll(/target: web[\s\S]*?- p50: (\d+)ms/g)]
  const last = matches[matches.length - 1]
  return last ? Number(last[1]) : null
}

async function main() {
  const countArg = process.argv.find(a => a.startsWith('--count='))
  const targetArg = process.argv.find(a => a.startsWith('--target='))

  const token = resolveToken(
    process.argv,
    'Usage: tsx baseline-latency.ts [--token=<token>] [--target=web|nest] [--count=20]',
  )

  const target = (targetArg?.split('=')[1] ?? 'web') as Target
  if (target !== 'web' && target !== 'nest') {
    console.error(`Unknown target: ${target} (expected web or nest)`)
    process.exit(1)
  }

  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 20

  const base =
    target === 'web'
      ? process.env.WEB_BASE_URL || 'http://localhost:8000'
      : process.env.NEST_API_URL || 'http://localhost:4000'
  const endpoint = `${base}/api/chat`
  const headers = target === 'web' ? webAuthHeaders(token) : nestAuthHeaders(token)

  console.log(`Measuring ${target} latency (${count} requests)`)
  console.log(`Endpoint: ${endpoint}\n`)

  const latencies = await measureLatency(endpoint, headers, count)

  if (latencies.length === 0) {
    console.error('No successful requests')
    process.exit(1)
  }

  const measurement: LatencyMeasurement = {
    timestamp: new Date().toISOString(),
    target,
    endpoint: '/api/chat',
    attempted: count,
    succeeded: latencies.length,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    meanMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
  }

  console.log(`\n=== ${target} latency ===`)
  console.log(`p50: ${measurement.p50Ms}ms`)
  console.log(`p95: ${measurement.p95Ms}ms`)
  console.log(`mean: ${measurement.meanMs}ms`)
  console.log(`successful: ${measurement.succeeded}/${measurement.attempted}`)

  const baselinePath = 'docs/baselines.md'

  // A run that mostly failed still produces a plausible-looking p50 from the few
  // survivors, so refuse to record it rather than publishing a misleading number.
  const successRate = measurement.succeeded / measurement.attempted
  if (successRate < 0.8) {
    console.error(
      `\nOnly ${measurement.succeeded}/${measurement.attempted} requests succeeded ` +
        `(${Math.round(successRate * 100)}%). Not recording — too few samples to trust.`,
    )
    process.exit(1)
  }

  if (target === 'nest') {
    const webP50 = readWebBaselineP50(baselinePath)
    if (webP50) {
      const bound = Math.round(webP50 * 1.2)
      const verdict = measurement.p50Ms <= bound ? '✅ within' : '❌ exceeds'
      console.log(`\n${verdict} the Phase 3 bound: ${measurement.p50Ms}ms vs ≤${bound}ms (web p50 ${webP50}ms +20%)`)
    } else {
      console.log('\nNo web baseline recorded yet; run without --target first to compare.')
    }
  }

  let content = existsSync(baselinePath)
    ? readFileSync(baselinePath, 'utf-8')
    : '# Performance Baselines\n\n'

  content += `## ${measurement.timestamp.split('T')[0]} — /api/chat (target: ${target})\n\n`
  content += `- Requests: ${measurement.succeeded}/${measurement.attempted} successful\n`
  content += `- p50: ${measurement.p50Ms}ms\n`
  content += `- p95: ${measurement.p95Ms}ms\n`
  content += `- mean: ${measurement.meanMs}ms\n\n`
  if (target === 'web') {
    content += `Phase 3 bound for Nest: p50 ≤ ${Math.round(measurement.p50Ms * 1.2)}ms\n\n`
  }

  writeFileSync(baselinePath, content, 'utf-8')
  console.log(`\nWritten to ${baselinePath}`)
}

main().catch(err => {
  console.error('Latency measurement failed:', err)
  process.exit(1)
})
