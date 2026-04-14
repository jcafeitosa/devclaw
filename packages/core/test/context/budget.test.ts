import { describe, expect, test } from "bun:test"
import { estimateTokens, trimToBudget } from "../../src/context/budget.ts"
import type { ContextItem } from "../../src/context/types.ts"

function item(id: string, content: string, score: number): ContextItem {
  return { id, sourceId: "s", kind: "text", content, score }
}

describe("estimateTokens", () => {
  test("returns at least 1 for non-empty string", () => {
    expect(estimateTokens("hi")).toBeGreaterThanOrEqual(1)
  })

  test("grows roughly with content length (chars/4 heuristic)", () => {
    const a = estimateTokens("a".repeat(100))
    const b = estimateTokens("a".repeat(400))
    expect(b / a).toBeGreaterThanOrEqual(3.5)
    expect(b / a).toBeLessThanOrEqual(4.5)
  })

  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })
})

describe("trimToBudget", () => {
  test("keeps all when sum ≤ budget", () => {
    const items = [item("a", "aa", 1), item("b", "bb", 0.5)]
    const { kept, dropped, tokensUsed } = trimToBudget(items, 100)
    expect(kept).toHaveLength(2)
    expect(dropped).toHaveLength(0)
    expect(tokensUsed).toBeGreaterThan(0)
  })

  test("drops lowest-scored items first", () => {
    const big = "x".repeat(1000)
    const items = [item("lo", big, 0.1), item("md", big, 0.5), item("hi", big, 0.9)]
    const { kept, dropped } = trimToBudget(items, estimateTokens(big) * 2)
    expect(kept.map((i) => i.id).sort()).toEqual(["hi", "md"])
    expect(dropped.map((i) => i.id)).toEqual(["lo"])
  })

  test("populates tokens field on kept items", () => {
    const items = [item("a", "abcd", 1)]
    const { kept } = trimToBudget(items, 100)
    expect(kept[0]?.tokens).toBeGreaterThan(0)
  })

  test("budget 0 drops everything", () => {
    const items = [item("a", "aaaa", 1)]
    const { kept, dropped } = trimToBudget(items, 0)
    expect(kept).toHaveLength(0)
    expect(dropped).toHaveLength(1)
  })

  test("stable ordering for same score (by id)", () => {
    const items = [item("z", "xx", 1), item("a", "xx", 1)]
    const { kept } = trimToBudget(items, 100)
    expect(kept.map((i) => i.id)).toEqual(["z", "a"])
  })
})
