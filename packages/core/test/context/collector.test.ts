import { describe, expect, test } from "bun:test"
import { MultiSourceCollector } from "../../src/context/collector.ts"
import type { ContextItem, ContextSource } from "../../src/context/types.ts"

function fixed(id: string, items: ContextItem[], delayMs = 0): ContextSource {
  return {
    id,
    async collect() {
      if (delayMs > 0) await Bun.sleep(delayMs)
      return items
    },
  }
}

describe("MultiSourceCollector", () => {
  test("collects from all sources in parallel", async () => {
    const a = fixed("a", [{ id: "a1", sourceId: "a", kind: "text", content: "A" }])
    const b = fixed("b", [{ id: "b1", sourceId: "b", kind: "text", content: "B" }])
    const c = new MultiSourceCollector([a, b])
    const { items, diagnostics } = await c.collect({ goal: "g", expectedOutput: "x" })
    expect(items.map((i) => i.id).sort()).toEqual(["a1", "b1"])
    expect(diagnostics).toEqual([])
  })

  test("failing source is isolated with error diagnostic", async () => {
    const good = fixed("ok", [{ id: "ok", sourceId: "ok", kind: "text", content: "G" }])
    const bad: ContextSource = {
      id: "bad",
      async collect() {
        throw new Error("no db")
      },
    }
    const c = new MultiSourceCollector([good, bad])
    const { items, diagnostics } = await c.collect({ goal: "g", expectedOutput: "x" })
    expect(items.map((i) => i.id)).toEqual(["ok"])
    expect(diagnostics[0]?.level).toBe("error")
    expect(diagnostics[0]?.sourceId).toBe("bad")
  })

  test("per-source timeout triggers warning without blocking others", async () => {
    const fast = fixed("fast", [{ id: "f", sourceId: "fast", kind: "text", content: "F" }], 5)
    const slow: ContextSource = {
      id: "slow",
      timeoutMs: 20,
      async collect(_req, signal) {
        return new Promise((_res, rej) => {
          signal?.addEventListener("abort", () => rej(new Error("aborted")))
        })
      },
    }
    const c = new MultiSourceCollector([fast, slow])
    const { items, diagnostics } = await c.collect({ goal: "g", expectedOutput: "x" })
    expect(items.map((i) => i.id)).toEqual(["f"])
    const slowDiag = diagnostics.find((d) => d.sourceId === "slow")
    expect(slowDiag?.level).toBe("error")
  })

  test("default source timeout from collector config applies", async () => {
    const hanging: ContextSource = {
      id: "h",
      async collect(_req, signal) {
        return new Promise((_res, rej) => {
          signal?.addEventListener("abort", () => rej(new Error("aborted")))
        })
      },
    }
    const c = new MultiSourceCollector([hanging], { defaultTimeoutMs: 20 })
    const { items, diagnostics } = await c.collect({ goal: "g", expectedOutput: "x" })
    expect(items).toEqual([])
    expect(diagnostics[0]?.sourceId).toBe("h")
  })
})
