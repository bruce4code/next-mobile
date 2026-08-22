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

/**
 * The two backends authenticate differently and cannot be driven with the
 * same credential:
 *
 *   web  — Supabase cookie session, read server-side via getUser()
 *   nest — Authorization: Bearer <access token>
 *
 * Sending a Bearer token to web yields 401 (it never looks at the header), so
 * each side gets the credential it actually understands. The cookie name is
 * derived from the Supabase project ref, matching @supabase/ssr's convention.
 */
type Auth = { kind: 'bearer'; token: string } | { kind: 'cookie'; cookie: string }

function supabaseCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const ref = url.match(/^https?:\/\/([^.]+)\./)?.[1]
  if (!ref) {
    throw new Error('Cannot derive Supabase project ref from SUPABASE_URL')
  }
  return `sb-${ref}-auth-token`
}

/**
 * Build the cookie @supabase/ssr expects: base64-encoded session JSON under
 * the project-scoped cookie name, prefixed with "base64-".
 */
function buildSessionCookie(token: string): string {
  const session = {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: '',
  }
  const encoded = Buffer.from(JSON.stringify(session), 'utf-8').toString('base64')
  return `${supabaseCookieName()}=base64-${encoded}`
}

async function fetchEndpoint(base: string, path: string, auth: Auth) {
  const url = `${base}${path}`
  const headers: Record<string, string> =
    auth.kind === 'bearer'
      ? { Authorization: `Bearer ${auth.token}` }
      : { Cookie: auth.cookie }

  const res = await fetch(url, { headers })

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: res.ok ? await res.json() : await res.text(),
  }
}

/**
 * Web and Nest do not share URL shapes for every capability
 * (web /api/user vs Nest /api/users/me), so each pair is listed
 * explicitly instead of reusing one path for both sides.
 */
const ENDPOINT_PAIRS: Record<string, { web: string; nest: string }> = {
  user: { web: '/api/user', nest: '/api/users/me' },
  'chat-history': { web: '/api/get-chat', nest: '/api/chat-history' },
  documents: { web: '/api/documents', nest: '/api/documents' },
}

async function main() {
  const serviceArg = process.argv.find(a => a.startsWith('--service='))
  const tokenArg = process.argv.find(a => a.startsWith('--token='))
  const queryArg = process.argv.find(a => a.startsWith('--query='))

  const token = tokenArg ? tokenArg.split('=').slice(1).join('=') : process.env.PARITY_TOKEN

  if (!serviceArg || !token) {
    console.error('Usage: tsx endpoint-roundtrip.ts --service=<name> [--token=<token>] [--query=?a=b]')
    console.error('Token may also come from PARITY_TOKEN (see: pnpm parity:token).')
    console.error(`Known services: ${Object.keys(ENDPOINT_PAIRS).join(', ')}`)
    process.exit(1)
  }

  const service = serviceArg.split('=')[1]
  const query = queryArg ? queryArg.split('=').slice(1).join('=') : ''

  const pair = ENDPOINT_PAIRS[service]
  if (!pair) {
    console.error(`Unknown service: ${service}`)
    console.error(`Known services: ${Object.keys(ENDPOINT_PAIRS).join(', ')}`)
    process.exit(1)
  }

  const webBase = process.env.WEB_BASE_URL || 'http://localhost:8000'
  const nestBase = process.env.NEST_API_URL || 'http://localhost:4000'

  console.log(`Comparing service: ${service}`)
  console.log(`Web:  ${webBase}${pair.web}${query}`)
  console.log(`Nest: ${nestBase}${pair.nest}${query}\n`)

  const [webRes, nestRes] = await Promise.all([
    fetchEndpoint(webBase, `${pair.web}${query}`, { kind: 'cookie', cookie: buildSessionCookie(token) }),
    fetchEndpoint(nestBase, `${pair.nest}${query}`, { kind: 'bearer', token }),
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

  // Only timestamps are excused: they legitimately differ in serialization
  // (Date vs ISO string) across the two stacks. id/email/etc must match —
  // excluding them would hide exactly the drift this check exists to catch.
  const diffs = deepEqual(webRes.body, nestRes.body, 'root', {
    ignoreTimestamps: true,
  })

  if (diffs.length === 0) {
    console.log('✅ PASS: Responses are identical (ignoring timestamps)\n')
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
