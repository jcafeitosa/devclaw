import { describe, expect, test } from "bun:test"
import { WorkItemStore } from "../../src/work/store.ts"
import { WorkflowEngine } from "../../src/work/workflow.ts"

describe("WorkflowEngine", () => {
  test("rules fire when trigger matches + condition passes", () => {
    const store = new WorkItemStore()
    const task = store.create({
      kind: "task",
      title: "x",
      priority: "high",
      tags: ["deploy"],
    })
    const engine = new WorkflowEngine()
    engine.register({
      id: "escalate-high-deploy",
      trigger: "deadline-missed",
      condition: { kind: ["task"], priorityAtLeast: "high", tag: "deploy" },
      actions: [{ type: "escalate" }, { type: "notify", params: { channel: "oncall" } }],
    })
    const actions = engine.dispatch({ trigger: "deadline-missed", item: task })
    expect(actions).toHaveLength(2)
    expect(actions.map((a) => a.action.type).sort()).toEqual(["escalate", "notify"])
  })

  test("condition priorityAtLeast filters lower-priority items", () => {
    const store = new WorkItemStore()
    const normal = store.create({ kind: "task", title: "x", priority: "normal" })
    const engine = new WorkflowEngine()
    engine.register({
      id: "high-only",
      trigger: "deadline-missed",
      condition: { priorityAtLeast: "high" },
      actions: [{ type: "escalate" }],
    })
    expect(engine.dispatch({ trigger: "deadline-missed", item: normal })).toEqual([])
  })

  test("duplicate rule id rejected", () => {
    const e = new WorkflowEngine()
    const rule = {
      id: "r",
      trigger: "item-created" as const,
      actions: [{ type: "notify" as const }],
    }
    e.register(rule)
    expect(() => e.register(rule)).toThrow(/already/i)
  })

  test("rulesFor only returns matching trigger", () => {
    const e = new WorkflowEngine()
    e.register({ id: "a", trigger: "item-created", actions: [{ type: "notify" }] })
    e.register({ id: "b", trigger: "agent-failed", actions: [{ type: "reassign" }] })
    expect(e.rulesFor("item-created").map((r) => r.id)).toEqual(["a"])
  })

  test("action_executed event fires", () => {
    const e = new WorkflowEngine()
    const seen: string[] = []
    e.events.on("action_executed", (a) => seen.push(a.action.type))
    e.register({
      id: "r",
      trigger: "budget-exceeded",
      actions: [{ type: "freeze" }, { type: "notify" }],
    })
    e.dispatch({ trigger: "budget-exceeded" })
    expect(seen).toEqual(["freeze", "notify"])
  })
})
