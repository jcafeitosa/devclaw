import type { ContextDiagnostic, ContextItem, ContextRequest, ContextSource } from "./types.ts"

export interface CollectorConfig {
  defaultTimeoutMs?: number
}

export interface CollectResult {
  items: ContextItem[]
  diagnostics: ContextDiagnostic[]
}

export class MultiSourceCollector {
  private readonly sources: ContextSource[]
  private readonly defaultTimeoutMs: number

  constructor(sources: ContextSource[], cfg: CollectorConfig = {}) {
    this.sources = sources
    this.defaultTimeoutMs = cfg.defaultTimeoutMs ?? 10_000
  }

  async collect(request: ContextRequest): Promise<CollectResult> {
    const results = await Promise.all(this.sources.map((src) => this.runOne(src, request)))
    const items: ContextItem[] = []
    const diagnostics: ContextDiagnostic[] = []
    for (const r of results) {
      items.push(...r.items)
      if (r.diagnostic) diagnostics.push(r.diagnostic)
    }
    return { items, diagnostics }
  }

  private async runOne(
    src: ContextSource,
    request: ContextRequest,
  ): Promise<{ items: ContextItem[]; diagnostic?: ContextDiagnostic }> {
    const timeoutMs = src.timeoutMs ?? this.defaultTimeoutMs
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const items = await src.collect(request, controller.signal)
      return { items }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      return {
        items: [],
        diagnostic: { level: "error", sourceId: src.id, message },
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
