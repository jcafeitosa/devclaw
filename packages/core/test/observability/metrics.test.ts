import { describe, expect, test } from "bun:test"
import { MetricsRegistry } from "../../src/observability/metrics.ts"
import type { MetricRecord } from "../../src/observability/types.ts"

describe("MetricsRegistry", () => {
  test("counter increments and snapshot exposes value", () => {
    const reg = new MetricsRegistry()
    const c = reg.counter("requests_total")
    c.inc()
    c.inc(5)
    expect(reg.snapshot()[0]).toMatchObject({ kind: "counter", name: "requests_total", value: 6 })
  })

  test("counter with labels segregates values", () => {
    const reg = new MetricsRegistry()
    const c = reg.counter("calls", { labels: ["status"] })
    c.inc(1, { status: "ok" })
    c.inc(2, { status: "ok" })
    c.inc(3, { status: "error" })
    const snap = reg.snapshot()
    const ok = snap.find((m) => m.labels?.status === "ok")!
    const err = snap.find((m) => m.labels?.status === "error")!
    expect(ok.value).toBe(3)
    expect(err.value).toBe(3)
  })

  test("gauge set + add work", () => {
    const reg = new MetricsRegistry()
    const g = reg.gauge("queue_depth")
    g.set(10)
    g.add(-3)
    expect(reg.snapshot()[0]!.value).toBe(7)
  })

  test("histogram tracks count + sum + buckets", () => {
    const reg = new MetricsRegistry()
    const h = reg.histogram("latency_ms", { buckets: [10, 100, 1000] })
    h.observe(5)
    h.observe(50)
    h.observe(500)
    const snap = reg.snapshot()[0] as MetricRecord & { buckets?: { le: number; count: number }[] }
    expect(snap.kind).toBe("histogram")
    expect(snap.value).toBe(3)
    expect(snap.buckets!.find((b) => b.le === 10)!.count).toBe(1)
    expect(snap.buckets!.find((b) => b.le === 100)!.count).toBe(2)
    expect(snap.buckets!.find((b) => b.le === 1000)!.count).toBe(3)
  })

  test("describe lists registered metrics with kind", () => {
    const reg = new MetricsRegistry()
    reg.counter("a")
    reg.gauge("b")
    reg.histogram("c", { buckets: [1] })
    const ds = reg.describe()
    expect(ds.find((d) => d.name === "a")!.kind).toBe("counter")
    expect(ds.find((d) => d.name === "b")!.kind).toBe("gauge")
    expect(ds.find((d) => d.name === "c")!.kind).toBe("histogram")
  })

  test("re-registering same name returns the same instance", () => {
    const reg = new MetricsRegistry()
    const a = reg.counter("x")
    const b = reg.counter("x")
    expect(a).toBe(b)
  })
})
