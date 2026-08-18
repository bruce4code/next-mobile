/**
 * Backend routing monitoring and logging
 *
 * Tracks which backend is used for each request.
 * Useful for monitoring rollout and debugging issues.
 */

import { type Backend } from "./backend-config"

export interface BackendRouteLog {
  timestamp: string
  service: string
  backend: Backend
  userId?: string
  url: string
  method: string
  statusCode?: number
  latencyMs?: number
  error?: string
}

/**
 * Log backend routing decision
 * Can be integrated with your logging service (e.g., Datadog, Sentry)
 */
export function logBackendRoute(log: BackendRouteLog) {
  // Console log for development
  if (process.env.NODE_ENV === "development") {
    console.log(`[Backend Route] ${log.service} → ${log.backend}`, {
      method: log.method,
      url: log.url,
      userId: log.userId,
      status: log.statusCode,
      latency: log.latencyMs ? `${log.latencyMs}ms` : undefined,
    })
  }

  // In production, send to monitoring service
  if (process.env.NODE_ENV === "production") {
    // Example: send to custom logging endpoint
    if (typeof fetch !== "undefined") {
      fetch("/api/internal/log-backend-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(log),
      }).catch(() => {
        // Ignore logging errors
      })
    }
  }
}

/**
 * Wrapper for API calls that logs routing decisions
 */
export async function loggedFetch(
  service: string,
  backend: Backend,
  url: string,
  options: RequestInit,
  userId?: string,
): Promise<Response> {
  const startTime = performance.now()

  const log: BackendRouteLog = {
    timestamp: new Date().toISOString(),
    service,
    backend,
    userId,
    url,
    method: options.method || "GET",
  }

  try {
    const response = await fetch(url, options)
    const latencyMs = Math.round(performance.now() - startTime)

    log.statusCode = response.status
    log.latencyMs = latencyMs

    logBackendRoute(log)

    return response
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime)

    log.error = error instanceof Error ? error.message : String(error)
    log.latencyMs = latencyMs

    logBackendRoute(log)

    throw error
  }
}

/**
 * Metrics aggregation (simple in-memory for development)
 * In production, use proper metrics service (Prometheus, Datadog, etc.)
 */
class BackendMetrics {
  private requestCounts = new Map<string, number>()
  private latencies = new Map<string, number[]>()

  recordRequest(service: string, backend: Backend, latencyMs: number) {
    const key = `${service}:${backend}`

    // Count
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1)

    // Latency
    const latencies = this.latencies.get(key) || []
    latencies.push(latencyMs)
    // Keep only last 1000 samples
    if (latencies.length > 1000) {
      latencies.shift()
    }
    this.latencies.set(key, latencies)
  }

  getMetrics(service: string) {
    const webKey = `${service}:web`
    const nestKey = `${service}:nest`

    const webLatencies = this.latencies.get(webKey) || []
    const nestLatencies = this.latencies.get(nestKey) || []

    return {
      web: {
        requestCount: this.requestCounts.get(webKey) || 0,
        p50: percentile(webLatencies, 50),
        p95: percentile(webLatencies, 95),
        p99: percentile(webLatencies, 99),
      },
      nest: {
        requestCount: this.requestCounts.get(nestKey) || 0,
        p50: percentile(nestLatencies, 50),
        p95: percentile(nestLatencies, 95),
        p99: percentile(nestLatencies, 99),
      },
    }
  }

  reset() {
    this.requestCounts.clear()
    this.latencies.clear()
  }
}

function percentile(arr: number[], p: number): number | null {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[index]
}

// Global metrics instance
export const backendMetrics = new BackendMetrics()

/**
 * Middleware helper to track backend metrics
 */
export function trackBackendMetrics(service: string, backend: Backend, latencyMs: number) {
  backendMetrics.recordRequest(service, backend, latencyMs)
}
