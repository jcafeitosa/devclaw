import { describe, expect, test } from "bun:test"
import { OrphanGoalError } from "../../src/governance/errors.ts"
import { GoalEngine } from "../../src/governance/goal_engine.ts"

describe("GoalEngine", () => {
  test("mission → objective → project → epic → task hierarchy", () => {
    const e = new GoalEngine()
    e.add({ id: "m", kind: "mission", title: "accelerate delivery" })
    e.add({ id: "o", kind: "objective", parentId: "m", title: "ship faster" })
    e.add({ id: "p", kind: "project", parentId: "o", title: "CI/CD" })
    e.add({ id: "ep", kind: "epic", parentId: "p", title: "pipeline" })
    e.add({ id: "t", kind: "task", parentId: "ep", title: "build caching" })
    expect(e.ancestors("t").map((n) => n.id)).toEqual(["ep", "p", "o", "m"])
  })

  test("orphan objective (no mission) throws", () => {
    const e = new GoalEngine()
    expect(() => e.add({ id: "o", kind: "objective", title: "x" })).toThrow(OrphanGoalError)
  })

  test("task under mission (wrong parent kind) rejected", () => {
    const e = new GoalEngine()
    e.add({ id: "m", kind: "mission", title: "m" })
    expect(() => e.add({ id: "t", kind: "task", parentId: "m", title: "t" })).toThrow(
      OrphanGoalError,
    )
  })

  test("task under project (valid) OK", () => {
    const e = new GoalEngine()
    e.add({ id: "m", kind: "mission", title: "m" })
    e.add({ id: "o", kind: "objective", parentId: "m", title: "o" })
    e.add({ id: "p", kind: "project", parentId: "o", title: "p" })
    e.add({ id: "t", kind: "task", parentId: "p", title: "t" })
    expect(e.children("p").map((n) => n.id)).toEqual(["t"])
  })

  test("prioritize: priority desc, then risk desc, then kind order", () => {
    const e = new GoalEngine()
    e.add({ id: "m", kind: "mission", title: "m" })
    e.add({ id: "o", kind: "objective", parentId: "m", title: "o" })
    e.add({ id: "p", kind: "project", parentId: "o", title: "p", priority: 1, risk: "low" })
    e.add({ id: "ep", kind: "epic", parentId: "p", title: "ep", priority: 2, risk: "high" })
    e.add({ id: "ep2", kind: "epic", parentId: "p", title: "ep2", priority: 2, risk: "critical" })
    const sorted = e.prioritize()
    const idx = (id: string) => sorted.findIndex((n) => n.id === id)
    expect(idx("ep2")).toBeLessThan(idx("ep"))
    expect(idx("ep")).toBeLessThan(idx("p"))
  })
})
