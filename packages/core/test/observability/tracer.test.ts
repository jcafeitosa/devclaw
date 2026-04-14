import { describe, expect, test } from "bun:test"
import { Tracer } from "../../src/observability/tracer.ts"
import type { TraceSpan } from "../../src/observability/types.ts"

describe("Tracer", () => {
  test("startSpan returns a span with id, name, startedAt", () => {
    const tracer = new Tracer({ sink: () => {}, now: () => 100 })
    const span = tracer.startSpan("op.do")
    expect(span.name).toBe("op.do")
    expect(span.startedAt).toBe(100)
    expect(span.spanId).toMatch(/^sp_/)
    expect(span.traceId).toMatch(/^tr_/)
  })

  test("end() emits the span to sink with duration + status", () => {
    let captured: TraceSpan | undefined
    let now = 100
    const tracer = new Tracer({ sink: (s) => (captured = s), now: () => now })
    const span = tracer.startSpan("op.do")
    now = 175
    span.setAttr("user", "bob")
    span.end({ status: "ok" })
    expect(captured).toBeDefined()
    expect(captured!.endedAt).toBe(175)
    expect(captured!.durationMs).toBe(75)
    expect(captured!.status).toBe("ok")
    expect(captured!.attrs.user).toBe("bob")
  })

  test("withSpan executes and ends span automatically on success", async () => {
    const spans: TraceSpan[] = []
    const tracer = new Tracer({ sink: (s) => spans.push(s) })
    const result = await tracer.withSpan("compute", async (span) => {
      span.setAttr("inputs", 3)
      return 42
    })
    expect(result).toBe(42)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.status).toBe("ok")
    expect(spans[0]!.attrs.inputs).toBe(3)
  })

  test("withSpan ends span with error status on throw", async () => {
    const spans: TraceSpan[] = []
    const tracer = new Tracer({ sink: (s) => spans.push(s) })
    await expect(
      tracer.withSpan("failing", async () => {
        throw new Error("nope")
      }),
    ).rejects.toThrow("nope")
    expect(spans[0]!.status).toBe("error")
    expect(spans[0]!.attrs.error).toContain("nope")
  })

  test("nested spans share traceId, child has parentSpanId", async () => {
    const spans: TraceSpan[] = []
    const tracer = new Tracer({ sink: (s) => spans.push(s) })
    await tracer.withSpan("outer", async (outer) => {
      await tracer.withSpan(
        "inner",
        async () => {
          /* noop */
        },
        { parent: outer },
      )
    })
    const inner = spans.find((s) => s.name === "inner")!
    const outer = spans.find((s) => s.name === "outer")!
    expect(inner.traceId).toBe(outer.traceId)
    expect(inner.parentSpanId).toBe(outer.spanId)
  })
})
