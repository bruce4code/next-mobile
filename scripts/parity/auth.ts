/**
 * Shared auth helpers for the parity scripts.
 *
 * The two backends accept different credentials and cannot be driven with the
 * same one:
 *
 *   web  — Supabase cookie session, read server-side via getUser()
 *   nest — Authorization: Bearer <access token>
 *
 * Sending a Bearer token to web yields 401 (it never reads the header), so each
 * side must get the credential it actually understands.
 */

/**
 * Cookie name @supabase/ssr uses, derived from the project ref in SUPABASE_URL.
 */
function supabaseCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const ref = url.match(/^https?:\/\/([^.]+)\./)?.[1]
  if (!ref) {
    throw new Error('Cannot derive Supabase project ref from SUPABASE_URL')
  }
  return `sb-${ref}-auth-token`
}

/**
 * Build the cookie @supabase/ssr expects: base64-encoded session JSON under the
 * project-scoped cookie name, prefixed with "base64-".
 */
export function buildSessionCookie(accessToken: string): string {
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: '',
  }
  const encoded = Buffer.from(JSON.stringify(session), 'utf-8').toString('base64')
  return `${supabaseCookieName()}=base64-${encoded}`
}

/** Headers for calling the web app (cookie session). */
export function webAuthHeaders(accessToken: string): Record<string, string> {
  return { Cookie: buildSessionCookie(accessToken) }
}

/** Headers for calling the Nest API (bearer token). */
export function nestAuthHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

/**
 * Read the token from --token= or PARITY_TOKEN, printing usage and exiting if
 * neither is present.
 */
export function resolveToken(argv: string[], usage: string): string {
  const tokenArg = argv.find((a) => a.startsWith('--token='))
  const token = tokenArg ? tokenArg.split('=').slice(1).join('=') : process.env.PARITY_TOKEN

  if (!token) {
    console.error(usage)
    console.error('Token may also come from PARITY_TOKEN (see: pnpm parity:token).')
    process.exit(1)
  }

  return token
}
