#!/usr/bin/env tsx
/**
 * Print a Supabase access token for the parity scripts.
 *
 * The parity harness needs a real user session, which only a password grant
 * can produce. Run this once, export the result, then run the parity scripts.
 *
 *   pnpm parity:token -- --email=you@example.com --password=...
 *   export PARITY_TOKEN=<printed token>
 *
 * Prints only the token on stdout so it can be captured directly:
 *   export PARITY_TOKEN=$(pnpm -s parity:token -- --email=... --password=...)
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const email = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1]
  const password = process.argv.find((a) => a.startsWith('--password='))?.split('=').slice(1).join('=')

  if (!email || !password) {
    console.error('Usage: tsx scripts/parity/get-token.ts --email=<email> --password=<password>')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env')
    process.exit(1)
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    console.error(`Sign-in failed: ${error?.message ?? 'no session returned'}`)
    process.exit(1)
  }

  // stdout: token only. Diagnostics go to stderr so command substitution stays clean.
  console.error(`Signed in as ${data.user?.email} (expires in ${data.session.expires_in}s)`)
  console.log(data.session.access_token)
}

main().catch((error) => {
  console.error('Token fetch failed:', error)
  process.exit(1)
})
