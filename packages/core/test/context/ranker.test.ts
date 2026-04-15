import { describe, expect, test } from "bun:test"
import { OverlapRanker, TokenAwareRanker, tokenize } from "../../src/context/ranker.ts"
import type { ContextItem, ContextRequest } from "../../src/context/types.ts"

function item(id: string, content: string): ContextItem {
  return { id, sourceId: "s", kind: "text", content }
}

describe("tokenize", () => {
  test("lowercases + splits on non-alphanumeric", () => {
    expect(tokenize("Hello, WORLD!")).toEqual(["hello", "world"])
  })

  test("filters short tokens", () => {
    expect(tokenize("a an the tool")).toEqual(["the", "tool"])
  })
})

describe("OverlapRanker", () => {
  const ranker = new OverlapRanker()

  test("higher overlap → higher score", () => {
    const req: ContextRequest = { goal: "migrate postgres schema", expectedOutput: "plan" }
    const hit = item("a", "Postgres schema migration via Drizzle")
    const miss = item("b", "React component guidelines")
    expect(ranker.score(req, hit)).toBeGreaterThan(ranker.score(req, miss))
  })

  test("zero overlap → score 0", () => {
    const req: ContextRequest = { goal: "apple banana", expectedOutput: "x" }
    const it = item("a", "car dog elephant")
    expect(ranker.score(req, it)).toBe(0)
  })

  test("score in [0, 1]", () => {
    const req: ContextRequest = { goal: "hello world", expectedOutput: "x" }
    expect(ranker.score(req, item("a", "hello world"))).toBeCloseTo(1, 5)
    expect(ranker.score(req, item("a", ""))).toBe(0)
  })

  test("hints contribute to goal-side vocabulary", () => {
    const req: ContextRequest = {
      goal: "fix bug",
      expectedOutput: "x",
      hints: ["memory", "leak"],
    }
    expect(ranker.score(req, item("a", "memory leak in allocator"))).toBeGreaterThan(0)
  })
})

describe("TokenAwareRanker", () => {
  test("penalizes longer items with equal relevance", () => {
    const base = new OverlapRanker()
    const ranker = new TokenAwareRanker(base, { alpha: 0.35 })
    const req: ContextRequest = { goal: "apple banana", expectedOutput: "x" }
    const short = item("a", "apple banana")
    const long = item("b", "apple banana orange pear kiwi")
    expect(base.score(req, short)).toBeCloseTo(base.score(req, long), 5)
    expect(ranker.score(req, short)).toBeGreaterThan(ranker.score(req, long))
  })
})
