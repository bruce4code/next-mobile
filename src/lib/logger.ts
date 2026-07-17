/**
 * 结构化日志工具
 *
 * 使用方式：
 *   import { logger } from '@/lib/logger'
 *   logger.info('RAG.Search', { query: '...', topK: 5 })
 *   logger.warn('RAG.Fallback', { reason: 'no keywords' })
 *   logger.error('RAG.Error', { error: String(err) })
 *
 * 输出格式：
 *   [2026-06-03T10:30:00.123Z] [INFO] [RAG.Search] { query: '...', topK: 5 }
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  tag: string
  message?: string
  data?: Record<string, unknown>
}

function formatLog(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    `[${entry.tag}]`,
  ]
  if (entry.message) parts.push(entry.message)
  if (entry.data) {
    const keys = Object.keys(entry.data)
    if (keys.length > 0) {
      parts.push(JSON.stringify(entry.data))
    }
  }
  return parts.join(' ')
}

function createLogEntry(
  level: LogLevel,
  tag: string,
  messageOrData?: string | Record<string, unknown>,
  data?: Record<string, unknown>,
): LogEntry {
  let message: string | undefined
  let payload: Record<string, unknown> | undefined

  if (typeof messageOrData === 'string') {
    message = messageOrData
    payload = data
  } else if (messageOrData) {
    payload = messageOrData
  }

  return {
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
    data: redactSensitiveData(payload),
  }
}

function redactSensitiveData(data?: Record<string, unknown>) {
  if (!data) return data

  const sensitiveKeys = new Set(['content', 'comment', 'keywords', 'prompt', 'query', 'text', 'title'])
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) && typeof value === 'string'
        ? `[redacted:${value.length} chars]`
        : value,
    ]),
  )
}

export const logger = {
  debug(tag: string, messageOrData?: string | Record<string, unknown>, data?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatLog(createLogEntry('debug', tag, messageOrData, data)))
    }
  },

  info(tag: string, messageOrData?: string | Record<string, unknown>, data?: Record<string, unknown>) {
    console.log(formatLog(createLogEntry('info', tag, messageOrData, data)))
  },

  warn(tag: string, messageOrData?: string | Record<string, unknown>, data?: Record<string, unknown>) {
    console.warn(formatLog(createLogEntry('warn', tag, messageOrData, data)))
  },

  error(tag: string, messageOrData?: string | Record<string, unknown>, data?: Record<string, unknown>) {
    console.error(formatLog(createLogEntry('error', tag, messageOrData, data)))
  },
}
