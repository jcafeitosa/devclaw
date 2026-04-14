import { describe, expect, test } from "bun:test"
import type { ContextObject } from "../../src/context/types.ts"
import { BudgetGuard } from "../../src/subagent/budget.ts"
import { filterContextForSubagent } from "../../src/subagent/context_filter.ts"
import { BudgetExceededError } from "../../src/subagent/errors.ts"

describe("BudgetGuard", () => {
  test("allows samples under thresholds", () => {
    const g = new BudgetGuard("s", { maxCostUsd: 1, budgetTokens: 1000 })
    g.add({ costUsd: 0.5, tokens: 500 })
    expect(g.snapshot().costUsd).toBe(0.5)
  })

  test("cost over threshold throws", () => {
    const g = new BudgetGuard("s", { maxCostUsd: 0.1 })
    expect(() => g.add({ costUsd: 1 })).toThrow(BudgetExceededError)
  })

  test("tokens over threshold throws", () => {
    const g = new BudgetGuard("s", { budgetTokens: 100 })
    expect(() => g.add({ tokens: 200 })).toThrow(BudgetExceededError)
  })

  test("duration over threshold throws on enforce", async () => {
    const g = new BudgetGuard("s", { maxDurationMs: 10 })
    await Bun.sleep(25)
    expect(() => g.enforce()).toThrow(BudgetExceededError)
  })

  test("snapshot returns accumulated metrics", () => {
    const g = new BudgetGuard("s", {})
    g.add({ costUsd: 0.2, tokens: 50 })
    g.add({ costUsd: 0.3, tokens: 150 })
    const snap = g.snapshot()
    expect(snap.costUsd).toBeCloseTo(0.5, 5)
    expect(snap.tokens).toBe(200)
  })
})

const parentCtx: ContextObject = {
  goal: "g",
  expectedOutput: "x",
  constraints: [],
  dependencies: [],
  risks: [],
  items: [
    {
      id: "a",
      sourceId: "kb",
      kind: "doc",
      content: "A",
      tokens: 10,
      meta: { tags: "db", tool: "fs_read" },
    },
    {
      id: "b",
      sourceId: "kb",
      kind: "code",
      content: "B",
      tokens: 20,
      meta: { tags: "ui", tool: "fs_write" },
    },
    {
      id: "c",
      sourceId: "mem",
      kind: "memory",
      content: "C",
      tokens: 5,
    },
  ],
  relevantData: [],
  diagnostics: [],
  totals: { items: 3, tokens: 35 },
}

describe("filterContextForSubagent", () => {
  test("no restrictions → identity (but recomputes totals)", () => {
    const out = filterContextForSubagent({ parent: parentCtx })
    expect(out.items.length).toBe(3)
    expect(out.totals.tokens).toBe(35)
  })

  test("allowKinds narrows items by kind", () => {
    const out = filterContextForSubagent({ parent: parentCtx, allowKinds: ["doc", "memory"] })
    expect(out.items.map((i) => i.id).sort()).toEqual(["a", "c"])
  })

  test("allowTags narrows items by tag intersection", () => {
    const out = filterContextForSubagent({ parent: parentCtx, allowTags: ["db"] })
    expect(out.items.map((i) => i.id)).toEqual(["a"])
  })

  test("toolDenylist drops items whose tool is denied", () => {
    const out = filterContextForSubagent({
      parent: parentCtx,
      restrictions: { toolDenylist: ["fs_write"] },
    })
    expect(out.items.map((i) => i.id).sort()).toEqual(["a", "c"])
  })

  test("toolAllowlist keeps only items matching allowed tool (items without tool pass)", () => {
    const out = filterContextForSubagent({
      parent: parentCtx,
      restrictions: { toolAllowlist: ["fs_read"] },
    })
    expect(out.items.map((i) => i.id).sort()).toEqual(["a", "c"])
  })
})
