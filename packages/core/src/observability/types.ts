export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogRecord {
  at: number
  level: LogLevel
  message: string
  attrs?: Record<string, unknown>
}

export type SpanStatus = "ok" | "error"

export interface TraceSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startedAt: number
  endedAt: number
  durationMs: number
  status: SpanStatus
  attrs: Record<string, unknown>
}

export type MetricKind = "counter" | "gauge" | "histogram"

export interface MetricRecord {
  kind: MetricKind
  name: string
  value: number
  sum?: number
  labels?: Record<string, string>
  buckets?: { le: number; count: number }[]
}

export type TelemetryEvent =
  | { kind: "log"; record: LogRecord }
  | { kind: "span"; span: TraceSpan }
  | { kind: "metric"; record: MetricRecord }

export interface TelemetryExporter {
  export(event: TelemetryEvent): void | Promise<void>
  flush?(): void | Promise<void>
}

export interface Sampler {
  shouldSample(): boolean
}
