#!/usr/bin/env tsx
/**
 * Phase 0 parity checker: API endpoint round-trip comparison
 *
 * Compares responses from web and Nest for the same authenticated request.
 * Usage:
 *   tsx scripts/parity/endpoint-roundtrip.ts \
 *     --endpoint=/api/user \
 *     --token=<access_token>
 */

import 'dotenv/config'

interface CompareOptions {
  ignoreFields?: string[]
  ignoreTimestamps?: boolean
}

function deepEqual(a: unknown, b: unknown, path: string, opts: CompareOptions): string[] {
  const diffs: string[] = []

  if (typeof a !== typeof b) {
    diffs.push(`${path}: type mismatch (${typeof a} vs ${typeof b})`)
    return diffs
  }

  if (a === null || b === null) {
    if (a !== b) diffs.push(`${path}: ${a} vs ${b}`)
    return diffs
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: array length ${a.length} vs ${b.length}`)
    }
    const minLen = Math.min(a.length, b.length)
    for (let i = 0; i < minLen; i++) {
      diffs.push(...deepEqual(a[i], b[i], `${path}[${i}]`, opts))
    }
    return diffs
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>
    const objB = b as Record<string, unknown>
    const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)])

    for (const key of allKeys) {
      if (opts.ignoreFields?.includes(key)) continue
      if (opts.ignoreTimestamps && (key.includes('At') || key.includes('Time'))) continue

      if (!(key in objA)) {
        diffs.push(`${path}.${key}: missing in left`)
      } else if (!(key in objB)) {
        diffs.push(`${path}.${key}: missing in right`)
      } else {
        diffs.push(...deepEqual(objA[key], objB[key], `${path}.${key}`, opts))
      }
    }
    return diffs
  }

  if (a !== b) {
    diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
  }

  return diffs
}

async function fetchEndpoint(base: string, path: string, token: string) {
  const url = `${base}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: res.ok ? await res.json() : await res.text(),
  }
}

async function main() {
  const endpointArg = process.argv.find(a => a.startsWith('--endpoint='))
  const tokenArg = process.argv.find(a => a.startsWith('--token='))

  if (!endpointArg || !tokenArg) {
    console.error('Usage: tsx endpoint-roundtrip.ts --endpoint=/api/user --token=<token>')
    process.exit(1)
  }

  const endpoint = endpointArg.split('=')[1]
  const token = tokenArg.split('=')[1]

  const webBase = process.env.WEB_BASE_URL || 'http://localhost:3000'
  const nestBase = process.env.NEST_API_URL || 'http://localhost:4000/api'

  console.log(`Comparing endpoint: ${endpoint}`)
  console.log(`Web:  ${webBase}`)
  console.log(`Nest: ${nestBase}\n`)

  const [webRes, nestRes] = await Promise.all([
    fetchEndpoint(webBase, endpoint, token),
    fetchEndpoint(nestBase, endpoint, token),
  ])

  console.log(`Web status:  ${webRes.status}`)
  console.log(`Nest status: ${nestRes.status}\n`)

  if (webRes.status !== nestRes.status) {
    console.log('❌ FAIL: Status code mismatch')
    process.exit(1)
  }

  if (!webRes.body || !nestRes.body) {
    console.log('❌ FAIL: One or both responses have no body')
    process.exit(1)
  }

  const diffs = deepEqual(webRes.body, nestRes.body, 'root', {
    ignoreFields: ['id', 'requestId'],
    ignoreTimestamps: true,
  })

  if (diffs.length === 0) {
    console.log('✅ PASS: Responses are identical (ignoring id/timestamps)\n')
    process.exit(0)
  } else {
    console.log('❌ FAIL: Response differences:')
    diffs.forEach(d => console.log(`  - ${d}`))
    console.log()
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Round-trip check failed:', err)
  process.exit(1)
})
