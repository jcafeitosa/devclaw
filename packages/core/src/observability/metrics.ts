import type { MetricKind, MetricRecord } from "./types.ts"

function labelKey(labels?: Record<string, string>): string {
  if (!labels) return ""
  const keys = Object.keys(labels).sort()
  return keys.map((k) => `${k}=${labels[k]}`).join(",")
}

class CounterImpl {
  private readonly buckets = new Map<string, { value: number; labels?: Record<string, string> }>()

  inc(amount = 1, labels?: Record<string, string>): void {
    const key = labelKey(labels)
    const cur = this.buckets.get(key) ?? { value: 0, labels }
    cur.value += amount
    this.buckets.set(key, cur)
  }

  snapshot(name: string): MetricRecord[] {
    const out: MetricRecord[] = []
    for (const entry of this.buckets.values()) {
      out.push({ kind: "counter", name, value: entry.value, labels: entry.labels })
    }
    return out
  }
}

class GaugeImpl {
  private value = 0

  set(value: number): void {
    this.value = value
  }

  add(delta: number): void {
    this.value += delta
  }

  snapshot(name: string): MetricRecord[] {
    return [{ kind: "gauge", name, value: this.value }]
  }
}

class HistogramImpl {
  private readonly counts: number[]
  private count = 0
  private sum = 0

  constructor(private readonly bounds: number[]) {
    this.counts = new Array(bounds.length).fill(0)
  }

  observe(value: number): void {
    this.count++
    this.sum += value
    for (let i = 0; i < this.bounds.length; i++) {
      if (value <= this.bounds[i]!) this.counts[i]!++
    }
  }

  snapshot(name: string): MetricRecord[] {
    return [
      {
        kind: "histogram",
        name,
        value: this.count,
        sum: this.sum,
        buckets: this.bounds.map((le, i) => ({ le, count: this.counts[i]! })),
      },
    ]
  }
}

export interface CounterOptions {
  labels?: string[]
}

export interface HistogramOptions {
  buckets: number[]
}

export interface MetricDescriptor {
  name: string
  kind: MetricKind
}

export interface Counter {
  inc(amount?: number, labels?: Record<string, string>): void
}

export interface Gauge {
  set(value: number): void
  add(delta: number): void
}

export interface Histogram {
  observe(value: number): void
}

export class MetricsRegistry {
  private readonly entries = new Map<
    string,
    { kind: MetricKind; impl: CounterImpl | GaugeImpl | HistogramImpl }
  >()

  counter(name: string, _opts?: CounterOptions): Counter {
    const existing = this.entries.get(name)
    if (existing && existing.kind === "counter") return existing.impl as CounterImpl
    const impl = new CounterImpl()
    this.entries.set(name, { kind: "counter", impl })
    return impl
  }

  gauge(name: string): Gauge {
    const existing = this.entries.get(name)
    if (existing && existing.kind === "gauge") return existing.impl as GaugeImpl
    const impl = new GaugeImpl()
    this.entries.set(name, { kind: "gauge", impl })
    return impl
  }

  histogram(name: string, opts: HistogramOptions): Histogram {
    const existing = this.entries.get(name)
    if (existing && existing.kind === "histogram") return existing.impl as HistogramImpl
    const impl = new HistogramImpl(opts.buckets)
    this.entries.set(name, { kind: "histogram", impl })
    return impl
  }

  describe(): MetricDescriptor[] {
    return [...this.entries.entries()].map(([name, e]) => ({ name, kind: e.kind }))
  }

  snapshot(): MetricRecord[] {
    const out: MetricRecord[] = []
    for (const [name, e] of this.entries) out.push(...e.impl.snapshot(name))
    return out
  }
}
