import { describe, expect, test } from "bun:test"
import { PlanCycleError } from "../../src/cognitive/errors.ts"
import { PlanGraph } from "../../src/cognitive/plan_graph.ts"
import type { Step } from "../../src/cognitive/types.ts"

function step(id: string, deps: string[] = [], priority = 0): Step {
  return { id, description: id, dependsOn: deps, priority }
}

describe("PlanGraph", () => {
  test("ready returns steps with all deps completed", () => {
    const g = new PlanGraph([step("a"), step("b", ["a"]), step("c", ["a", "b"])])
    expect(g.ready().map((s) => s.id)).toEqual(["a"])
    g.complete("a")
    expect(g.ready().map((s) => s.id)).toEqual(["b"])
    g.complete("b")
    expect(g.ready().map((s) => s.id)).toEqual(["c"])
  })

  test("isDone after all completed", () => {
    const g = new PlanGraph([step("a"), step("b", ["a"])])
    g.complete("a")
    g.complete("b")
    expect(g.isDone()).toBe(true)
  })

  test("failed step blocks dependents", () => {
    const g = new PlanGraph([step("a"), step("b", ["a"])])
    g.fail("a")
    expect(g.ready()).toEqual([])
    expect(g.states().find((s) => s.id === "b")?.status).toBe("pending")
  })

  test("cycle detection throws PlanCycleError", () => {
    expect(() => new PlanGraph([step("a", ["b"]), step("b", ["a"])])).toThrow(PlanCycleError)
  })

  test("ready respects priority (desc)", () => {
    const g = new PlanGraph([step("a", [], 1), step("b", [], 5), step("c", [], 3)])
    expect(g.ready().map((s) => s.id)).toEqual(["b", "c", "a"])
  })

  test("isDone false while pending", () => {
    const g = new PlanGraph([step("a")])
    expect(g.isDone()).toBe(false)
  })

  test("complete/fail unknown throws", () => {
    const g = new PlanGraph([step("a")])
    expect(() => g.complete("x")).toThrow(/unknown step/i)
  })
})
