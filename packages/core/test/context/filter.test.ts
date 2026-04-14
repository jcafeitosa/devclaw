import { describe, expect, test } from "bun:test"
import { applyThresholdFilter } from "../../src/context/filter.ts"
import type { ContextItem } from "../../src/context/types.ts"

function item(id: string, score: number): ContextItem {
  return { id, sourceId: "s", kind: "text", content: "x", score }
}

describe("applyThresholdFilter", () => {
  test("drops items below threshold", () => {
    const items = [item("a", 0.1), item("b", 0.5), item("c", 0.9)]
    const kept = applyThresholdFilter(items, 0.3)
    expect(kept.map((i) => i.id)).toEqual(["b", "c"])
  })

  test("threshold 0 keeps all scored items", () => {
    const items = [item("a", 0), item("b", 0.1)]
    expect(applyThresholdFilter(items, 0).length).toBe(2)
  })

  test("items without score treated as 0", () => {
    const items: ContextItem[] = [
      { id: "a", sourceId: "s", kind: "text", content: "" },
      item("b", 0.5),
    ]
    const kept = applyThresholdFilter(items, 0.1)
    expect(kept.map((i) => i.id)).toEqual(["b"])
  })
})
