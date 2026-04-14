import { describe, expect, test } from "bun:test"
import type {
  ContextItem,
  ContextObject,
  ContextRequest,
  ContextSource,
} from "../../src/context/types.ts"

describe("Context types", () => {
  test("ContextRequest minimal shape compiles", () => {
    const r: ContextRequest = { goal: "g", expectedOutput: "x" }
    expect(r.goal).toBe("g")
  })

  test("ContextItem minimal shape compiles", () => {
    const i: ContextItem = { id: "x", sourceId: "s", kind: "text", content: "..." }
    expect(i.id).toBe("x")
  })

  test("ContextSource interface accepts async collect", async () => {
    const src: ContextSource = {
      id: "test",
      async collect() {
        return []
      },
    }
    expect(await src.collect({ goal: "", expectedOutput: "" })).toEqual([])
  })

  test("ContextObject carries totals + diagnostics", () => {
    const obj: ContextObject = {
      goal: "g",
      expectedOutput: "x",
      constraints: [],
      dependencies: [],
      risks: [],
      relevantData: [],
      items: [],
      diagnostics: [],
      totals: { items: 0, tokens: 0 },
    }
    expect(obj.totals.items).toBe(0)
  })
})
