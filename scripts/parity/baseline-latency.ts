#!/usr/bin/env tsx
/**
 * Phase 0 baseline: Capture pre-migration latency baseline
 *
 * Measures p50/p95 latency for web /api/chat endpoint.
 * Writes baseline to docs/baselines.md for Phase 3 acceptance.
 */

import 'dotenv/config'
import { writeFileSync, existsSync, readFileSync } from 'fs'

interface LatencyMeasurement {
  timestamp: string
  endpoint: string
  requestCount: number
  p50Ms: number
  p95Ms: number
  meanMs: number
}

async function measureLatency(url: string, token: string, count: number): Promise<number[]> {
  const latencies: number[] = []
  const body = JSON.stringify({
    messages: [{ role: 'user', content: 'Hello' }],
    useRAG: false,
  })

  for (let i = 0; i < count; i++) {
    const start = Date.now()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
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

async function main() {
  const tokenArg = process.argv.find(a => a.startsWith('--token='))
  const countArg = process.argv.find(a => a.startsWith('--count='))

  const token = tokenArg ? tokenArg.split('=').slice(1).join('=') : process.env.PARITY_TOKEN

  if (!token) {
    console.error('Usage: tsx baseline-latency.ts [--token=<token>] [--count=20]')
    console.error('Token may also come from PARITY_TOKEN (see: pnpm parity:token).')
    process.exit(1)
  }

  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 20

  const webBase = process.env.WEB_BASE_URL || 'http://localhost:8000'
  const endpoint = `${webBase}/api/chat`

  console.log(`Measuring baseline latency (${count} requests)`)
  console.log(`Endpoint: ${endpoint}\n`)

  const latencies = await measureLatency(endpoint, token, count)

  if (latencies.length === 0) {
    console.error('No successful requests')
    process.exit(1)
  }

  const p50 = percentile(latencies, 50)
  const p95 = percentile(latencies, 95)
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length

  const measurement: LatencyMeasurement = {
    timestamp: new Date().toISOString(),
    endpoint: '/api/chat',
    requestCount: latencies.length,
    p50Ms: Math.round(p50),
    p95Ms: Math.round(p95),
    meanMs: Math.round(mean),
  }

  console.log('\n=== Baseline Captured ===')
  console.log(`p50: ${measurement.p50Ms}ms`)
  console.log(`p95: ${measurement.p95Ms}ms`)
  console.log(`mean: ${measurement.meanMs}ms`)
  console.log(`successful: ${latencies.length}/${count}\n`)

  const baselinePath = 'docs/baselines.md'
  let content = ''

  if (existsSync(baselinePath)) {
    content = readFileSync(baselinePath, 'utf-8')
  } else {
    content = '# Performance Baselines\n\n'
  }

  content += `## ${measurement.timestamp.split('T')[0]} — Pre-migration (web /api/chat)\n\n`
  content += `- Requests: ${measurement.requestCount}\n`
  content += `- p50: ${measurement.p50Ms}ms\n`
  content += `- p95: ${measurement.p95Ms}ms\n`
  content += `- mean: ${measurement.meanMs}ms\n\n`
  content += `Phase 3 acceptance: Nest p50 must stay within 20% (≤${Math.round(measurement.p50Ms * 1.2)}ms)\n\n`

  writeFileSync(baselinePath, content, 'utf-8')
  console.log(`Baseline written to ${baselinePath}`)
}

main().catch(err => {
  console.error('Baseline capture failed:', err)
  process.exit(1)
})
