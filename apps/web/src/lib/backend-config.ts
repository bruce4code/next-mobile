/**
 * Backend routing configuration
 *
 * Reads NEXT_PUBLIC_*_BACKEND env vars to determine which backend to use.
 * All flags default to "web" for backward compatibility.
 */

export type Backend = "web" | "nest"

interface BackendConfig {
  ingestion: Backend
  user: Backend
  chatHistory: Backend
  chat: Backend
  feedback: Backend
  documents: Backend
}

function getBackend(envVar: string | undefined, defaultValue: Backend = "web"): Backend {
  if (!envVar) return defaultValue
  const value = envVar.toLowerCase()
  return value === "nest" ? "nest" : "web"
}

export const backendConfig: BackendConfig = {
  ingestion: getBackend(process.env.NEXT_PUBLIC_INGESTION_BACKEND),
  user: getBackend(process.env.NEXT_PUBLIC_USER_BACKEND),
  chatHistory: getBackend(process.env.NEXT_PUBLIC_CHAT_HISTORY_BACKEND),
  chat: getBackend(process.env.NEXT_PUBLIC_CHAT_BACKEND),
  feedback: getBackend(process.env.NEXT_PUBLIC_FEEDBACK_BACKEND),
  documents: getBackend(process.env.NEXT_PUBLIC_DOCUMENTS_BACKEND),
}

/**
 * Get base URL for a given backend type
 */
export function getBackendUrl(backend: Backend): string {
  if (backend === "nest") {
    return process.env.NEXT_PUBLIC_NEST_API_URL || "http://localhost:4000"
  }
  return "" // Next.js API routes (same origin)
}

/**
 * Build full API URL based on backend config
 */
export function getApiUrl(service: keyof BackendConfig, path: string): string {
  const backend = backendConfig[service]
  const baseUrl = getBackendUrl(backend)

  // Normalize path to start with /api
  const normalizedPath = path.startsWith("/api") ? path : `/api${path.startsWith("/") ? path : `/${path}`}`

  return `${baseUrl}${normalizedPath}`
}
