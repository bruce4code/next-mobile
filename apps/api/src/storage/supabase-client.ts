import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Create a Supabase client with per-request user token.
 * Use this for storage operations that need user-level RLS.
 *
 * @param userToken - JWT token from Authorization header (without "Bearer " prefix)
 */
export function createUserSupabaseClient(userToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required")
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    },
  })
}

/**
 * Extract storage bucket and path from sourceUri.
 * Format: supabase://bucket/path/to/file
 *
 * @returns {bucket, path} or null if invalid
 */
export function parseStorageUri(sourceUri: string): { bucket: string; path: string } | null {
  const match = sourceUri.match(/^supabase:\/\/([^/]+)\/(.+)$/)
  if (!match) return null
  return { bucket: match[1], path: match[2] }
}
