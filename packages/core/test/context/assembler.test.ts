import { describe, expect, test } from "bun:test"
import { ContextAssembler } from "../../src/context/assembler.ts"
import { MultiSourceCollector } from "../../src/context/collector.ts"
import { ContextEmptyError, ContextQualityError } from "../../src/context/errors.ts"
import type { ContextItem, ContextSource } from "../../src/context/types.ts"

function fixed(id: string, items: ContextItem[]): ContextSource {
  return {
    id,
    async collect() {
      return items
    },
  }
}

describe("ContextAssembler", () => {
  test("assembles full ContextObject end-to-end", async () => {
    const src = fixed("kb", [
      {
        id: "k1",
        sourceId: "kb",
        kind: "doc",
        content: "migrate postgres schema using drizzle",
      },
      { id: "k2", sourceId: "kb", kind: "doc", content: "unrelated frontend notes" },
    ])
    const a = new ContextAssembler({ collector: new MultiSourceCollector([src]) })
    const obj = await a.assemble({
      goal: "migrate postgres schema",
      expectedOutput: "migration plan",
      constraints: ["no downtime"],
      dependencies: ["drizzle-kit"],
      risks: ["data loss"],
      background: "production db",
    })
    expect(obj.goal).toBe("migrate postgres schema")
    expect(obj.background).toBe("production db")
    expect(obj.constraints).toEqual(["no downtime"])
    expect(obj.items.length).toBeGreaterThan(0)
    expect(obj.relevantData[0]?.id).toBe("k1")
    expect(obj.totals.items).toBe(obj.items.length)
    expect(obj.totals.tokens).toBeGreaterThan(0)
  })

  test("throws ContextEmptyError when expectedOutput missing", async () => {
    const a = new ContextAssembler({ collector: new MultiSourceCollector([]) })
    await expect(a.assemble({ goal: "g", expectedOutput: "" })).rejects.toBeInstanceOf(
      ContextEmptyError,
    )
  })

  test("applies token budget", async () => {
    const big = "x".repeat(4000)
    const src = fixed("kb", [
      { id: "hi", sourceId: "kb", kind: "text", content: `important ${big}` },
      { id: "lo", sourceId: "kb", kind: "text", content: `noise ${big}` },
    ])
    const a = new ContextAssembler({ collector: new MultiSourceCollector([src]) })
    const obj = await a.assemble({
      goal: "important task",
      expectedOutput: "result",
      budgetTokens: 1500,
    })
    expect(obj.totals.tokens).toBeLessThanOrEqual(1500)
    expect(obj.diagnostics.some((d) => d.message.toLowerCase().includes("budget"))).toBe(true)
  })

  test("throws ContextQualityError when all items below minQualityScore", async () => {
    const src = fixed("kb", [
      { id: "k", sourceId: "kb", kind: "text", content: "totally unrelated" },
    ])
    const a = new ContextAssembler({ collector: new MultiSourceCollector([src]) })
    await expect(
      a.assemble({
        goal: "migrate postgres",
        expectedOutput: "plan",
        minQualityScore: 0.5,
      }),
    ).rejects.toBeInstanceOf(ContextQualityError)
  })

  test("preserves source diagnostics in result", async () => {
    const bad: ContextSource = {
      id: "bad",
      async collect() {
        throw new Error("no")
      },
    }
    const good = fixed("kb", [
      { id: "k", sourceId: "kb", kind: "text", content: "relevant migration content" },
    ])
    const a = new ContextAssembler({ collector: new MultiSourceCollector([bad, good]) })
    const obj = await a.assemble({ goal: "migration", expectedOutput: "plan" })
    expect(obj.diagnostics.some((d) => d.sourceId === "bad")).toBe(true)
  })
})
