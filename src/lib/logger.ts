/**
 * ATELIER CMS — System Logger
 * Minimal structured logger for key operations.
 * Outputs JSON lines to stdout/stderr — easy to pipe to any log aggregator.
 * In browser contexts (client components), falls back to console.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  ts:      string         // ISO timestamp
  level:   LogLevel
  system:  string         // subsystem (ai, persistence, timeline, automation)
  event:   string         // event name
  data?:   Record<string, unknown>
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry)
  if (entry.level === 'error' || entry.level === 'warn') {
    console.error(line)
  } else {
    console.log(line)
  }
}

function log(level: LogLevel, system: string, event: string, data?: Record<string, unknown>): void {
  emit({ ts: new Date().toISOString(), level, system, event, data })
}

export const logger = {
  info:  (system: string, event: string, data?: Record<string, unknown>) => log('info',  system, event, data),
  warn:  (system: string, event: string, data?: Record<string, unknown>) => log('warn',  system, event, data),
  error: (system: string, event: string, data?: Record<string, unknown>) => log('error', system, event, data),
  debug: (system: string, event: string, data?: Record<string, unknown>) => log('debug', system, event, data),
}
