import type { LogLevel, LogRecord } from "./types.ts"

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export type LogSink = (record: LogRecord) => void

export interface StructuredLoggerConfig {
  sink: LogSink
  minLevel?: LogLevel
  defaultAttrs?: Record<string, unknown>
  now?: () => number
}

function captureError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

function normalizeAttrs(attrs?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!attrs) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs)) {
    out[k] = v instanceof Error ? captureError(v) : v
  }
  return out
}

export class StructuredLogger {
  private readonly sink: LogSink
  private readonly minLevel: LogLevel
  private readonly defaultAttrs: Record<string, unknown>
  private readonly now: () => number

  constructor(cfg: StructuredLoggerConfig) {
    this.sink = cfg.sink
    this.minLevel = cfg.minLevel ?? "debug"
    this.defaultAttrs = cfg.defaultAttrs ?? {}
    this.now = cfg.now ?? Date.now
  }

  child(attrs: Record<string, unknown>): StructuredLogger {
    return new StructuredLogger({
      sink: this.sink,
      minLevel: this.minLevel,
      defaultAttrs: { ...this.defaultAttrs, ...attrs },
      now: this.now,
    })
  }

  debug(message: string, attrs?: Record<string, unknown>): void {
    this.emit("debug", message, attrs)
  }
  info(message: string, attrs?: Record<string, unknown>): void {
    this.emit("info", message, attrs)
  }
  warn(message: string, attrs?: Record<string, unknown>): void {
    this.emit("warn", message, attrs)
  }
  error(message: string, attrs?: Record<string, unknown>): void {
    this.emit("error", message, attrs)
  }

  private emit(level: LogLevel, message: string, attrs?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return
    const merged = { ...this.defaultAttrs, ...(normalizeAttrs(attrs) ?? {}) }
    const record: LogRecord = {
      at: this.now(),
      level,
      message,
      attrs: Object.keys(merged).length > 0 ? merged : undefined,
    }
    this.sink(record)
  }
}
