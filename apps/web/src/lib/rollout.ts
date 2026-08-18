/**
 * Per-user backend rollout logic
 *
 * Provides utilities for gradual rollout of Nest backend to users.
 * Supports percentage-based rollout with consistent hashing.
 */

import { backendConfig, type Backend } from "./backend-config"
import { createHash } from "crypto"

interface RolloutConfig {
  enabled: boolean
  percentage: number // 0-100
  allowlist: string[] // User IDs to always use Nest
  blocklist: string[] // User IDs to never use Nest
}

/**
 * Get rollout configuration from environment
 */
function getRolloutConfig(): RolloutConfig {
  return {
    enabled: process.env.NEXT_PUBLIC_NEST_ROLLOUT_ENABLED === "true",
    percentage: Number(process.env.NEXT_PUBLIC_NEST_ROLLOUT_PERCENTAGE) || 0,
    allowlist: (process.env.NEXT_PUBLIC_NEST_ROLLOUT_ALLOWLIST || "").split(",").filter(Boolean),
    blocklist: (process.env.NEXT_PUBLIC_NEST_ROLLOUT_BLOCKLIST || "").split(",").filter(Boolean),
  }
}

/**
 * Hash user ID to a consistent number between 0-99
 * Same user always gets same hash (sticky routing)
 */
function hashUserId(userId: string): number {
  const hash = createHash("sha256").update(userId).digest("hex")
  // Take first 8 chars and convert to number
  const num = parseInt(hash.substring(0, 8), 16)
  return num % 100
}

/**
 * Determine if user should use Nest backend based on rollout config
 *
 * @param userId - User ID for consistent hashing
 * @param service - Optional service name to check specific backend flag
 * @returns Backend to use ("web" or "nest")
 */
export function getUserBackend(userId: string, service?: keyof typeof backendConfig): Backend {
  const config = getRolloutConfig()

  // If rollout is not enabled, use configured backend
  if (!config.enabled) {
    return service ? backendConfig[service] : "web"
  }

  // Check blocklist first
  if (config.blocklist.includes(userId)) {
    return "web"
  }

  // Check allowlist
  if (config.allowlist.includes(userId)) {
    return "nest"
  }

  // Percentage-based rollout with consistent hashing
  const userHash = hashUserId(userId)
  if (userHash < config.percentage) {
    return "nest"
  }

  return "web"
}

/**
 * Override backend config for a specific user
 * Use in middleware or API routes
 *
 * @example
 * ```typescript
 * // In API route
 * const userBackends = getUserBackendOverrides(user.id)
 * if (userBackends.chat === "nest") {
 *   // Use Nest implementation
 * }
 * ```
 */
export function getUserBackendOverrides(userId: string) {
  const config = getRolloutConfig()

  if (!config.enabled) {
    return backendConfig
  }

  const userBackend = getUserBackend(userId)

  // If user is in Nest rollout, override all services
  if (userBackend === "nest") {
    return {
      ingestion: "nest" as Backend,
      user: "nest" as Backend,
      chatHistory: "nest" as Backend,
      chat: "nest" as Backend,
      feedback: "nest" as Backend,
      documents: "nest" as Backend,
    }
  }

  return backendConfig
}

/**
 * Get rollout status for debugging/monitoring
 */
export function getRolloutStatus(userId: string) {
  const config = getRolloutConfig()
  const backend = getUserBackend(userId)
  const userHash = hashUserId(userId)

  return {
    enabled: config.enabled,
    percentage: config.percentage,
    userBackend: backend,
    userHash,
    isAllowlisted: config.allowlist.includes(userId),
    isBlocklisted: config.blocklist.includes(userId),
  }
}
