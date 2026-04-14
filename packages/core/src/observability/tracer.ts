import type { TraceSpan } from "./types.ts"

export type SpanSink = (span: TraceSpan) => void

export interface TracerConfig {
  sink: SpanSink
  now?: () => number
  rng?: () => string
}

export interface SpanHandle {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startedAt: number
  setAttr(key: string, value: unknown): void
  end(opts?: { status?: "ok" | "error"; attrs?: Record<string, unknown> }): void
}

export interface WithSpanOptions {
  parent?: SpanHandle
  attrs?: Record<string, unknown>
}

function defaultRng(): string {
  return Math.floor(Math.random() * 1e12).toString(36)
}

export class Tracer {
  private readonly sink: SpanSink
  private readonly now: () => number
  private readonly rng: () => string

  constructor(cfg: TracerConfig) {
    this.sink = cfg.sink
    this.now = cfg.now ?? Date.now
    this.rng = cfg.rng ?? defaultRng
  }

  startSpan(name: string, opts: WithSpanOptions = {}): SpanHandle {
    const traceId = opts.parent?.traceId ?? `tr_${this.rng()}`
    const spanId = `sp_${this.rng()}`
    const startedAt = this.now()
    const attrs: Record<string, unknown> = { ...(opts.attrs ?? {}) }
    let ended = false
    const handle: SpanHandle = {
      traceId,
      spanId,
      parentSpanId: opts.parent?.spanId,
      name,
      startedAt,
      setAttr: (k, v) => {
        attrs[k] = v
      },
      end: (endOpts) => {
        if (ended) return
        ended = true
        if (endOpts?.attrs) Object.assign(attrs, endOpts.attrs)
        const endedAt = this.now()
        this.sink({
          traceId,
          spanId,
          parentSpanId: opts.parent?.spanId,
          name,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          status: endOpts?.status ?? "ok",
          attrs,
        })
      },
    }
    return handle
  }

  async withSpan<R>(
    name: string,
    fn: (span: SpanHandle) => Promise<R> | R,
    opts: WithSpanOptions = {},
  ): Promise<R> {
    const span = this.startSpan(name, opts)
    try {
      const result = await fn(span)
      span.end({ status: "ok" })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      span.end({ status: "error", attrs: { error: message } })
      throw err
    }
  }
}
