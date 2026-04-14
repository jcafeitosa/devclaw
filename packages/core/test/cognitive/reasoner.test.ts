import { describe, expect, test } from "bun:test"
import { PlanGraph } from "../../src/cognitive/plan_graph.ts"
import { DefaultReasoner } from "../../src/cognitive/reasoner.ts"
import type { Step } from "../../src/cognitive/types.ts"

function step(id: string, deps: string[] = [], priority = 0): Step {
  return { id, description: id, dependsOn: deps, priority }
}

describe("DefaultReasoner", () => {
  test("picks highest-priority ready step", () => {
    const g = new PlanGraph([step("a", [], 1), step("b", [], 5), step("c", [], 3)])
    const r = new DefaultReasoner()
    expect(r.pick(g)?.id).toBe("b")
  })

  test("returns null when no ready step", () => {
    const g = new PlanGraph([step("a"), step("b", ["a"])])
    const r = new DefaultReasoner()
    g.complete("a")
    g.complete("b")
    expect(r.pick(g)).toBeNull()
  })

  test("skips steps waiting on incomplete deps", () => {
    const g = new PlanGraph([step("a"), step("b", ["a"], 10)])
    const r = new DefaultReasoner()
    expect(r.pick(g)?.id).toBe("a")
  })
})
