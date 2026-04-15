/**
 * Structured server-side logger — emits JSON to stdout so Vercel captures it.
 * Usage: import { log } from '@/lib/logger'
 *        log.info('route', 'message', { extra })
 *        log.warn('route', 'message')
 *        log.error('route', err, { extra })
 */

type Level = 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string
  level: Level
  route: string
  msg: string
  [key: string]: unknown
}

function emit(level: Level, route: string, msg: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    route,
    msg,
    ...meta,
  }
  // In production Vercel captures stdout as structured logs
  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}

export const log = {
  info: (route: string, msg: string, meta?: Record<string, unknown>) =>
    emit('info', route, msg, meta),

  warn: (route: string, msg: string, meta?: Record<string, unknown>) =>
    emit('warn', route, msg, meta),

  error: (route: string, err: unknown, meta?: Record<string, unknown>) => {
    const errMeta: Record<string, unknown> = { ...meta }
    if (err instanceof Error) {
      errMeta.error = err.message
      errMeta.stack = err.stack?.split('\n').slice(0, 5).join(' | ')
    } else {
      errMeta.error = String(err)
    }
    emit('error', route, 'Unhandled error', errMeta)
  },
}
