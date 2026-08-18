/**
 * API client helpers with backend routing
 *
 * Wraps fetch calls to automatically route to correct backend based on config.
 * Handles authentication token injection for Nest endpoints.
 * Includes monitoring and rollout support.
 */

import { getApiUrl, backendConfig, type Backend } from "./backend-config"
import { getUserBackend } from "./rollout"
import { logBackendRoute } from "./backend-monitoring"

interface RequestOptions extends RequestInit {
  backend?: Backend
  userId?: string // For per-user rollout
  skipMonitoring?: boolean
}

/**
 * Fetch wrapper that routes to correct backend and injects auth token
 */
export async function apiFetch(
  service: keyof typeof backendConfig,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const startTime = performance.now()

  // Determine backend (with per-user rollout support)
  let backend = options.backend ?? backendConfig[service]
  if (options.userId) {
    backend = getUserBackend(options.userId, service)
  }

  const url = getApiUrl(service, path)

  const headers = new Headers(options.headers)

  // Inject Supabase token for Nest backend
  if (backend === "nest") {
    const token = await getSupabaseToken()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    // Log routing decision
    if (!options.skipMonitoring) {
      const latencyMs = Math.round(performance.now() - startTime)
      logBackendRoute({
        timestamp: new Date().toISOString(),
        service,
        backend,
        userId: options.userId,
        url,
        method: options.method || "GET",
        statusCode: response.status,
        latencyMs,
      })
    }

    return response
  } catch (error) {
    // Log error
    if (!options.skipMonitoring) {
      const latencyMs = Math.round(performance.now() - startTime)
      logBackendRoute({
        timestamp: new Date().toISOString(),
        service,
        backend,
        userId: options.userId,
        url,
        method: options.method || "GET",
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    throw error
  }
}

/**
 * Get Supabase access token
 * Works in both server and client contexts
 */
async function getSupabaseToken(): Promise<string | null> {
  // Client-side: import dynamically to avoid SSR issues
  if (typeof window !== "undefined") {
    try {
      const { createBrowserClient } = await import("@supabase/ssr")
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const {
        data: { session },
      } = await supabase.auth.getSession()
      return session?.access_token ?? null
    } catch {
      return null
    }
  }

  // Server-side: use cookies
  try {
    const { cookies } = await import("next/headers")
    const { createServerClient } = await import("@supabase/ssr")

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {}, // No-op on read-only context
        },
      },
    )

    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  } catch {
    return null
  }
}
