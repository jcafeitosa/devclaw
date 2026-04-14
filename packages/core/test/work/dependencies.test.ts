import { describe, expect, test } from "bun:test"
import { DependencyEngine } from "../../src/work/dependencies.ts"
import { InvalidDependencyError, WorkCycleError } from "../../src/work/errors.ts"
import { WorkItemStore } from "../../src/work/store.ts"

function setup() {
  const store = new WorkItemStore()
  const engine = new DependencyEngine(store)
  return { store, engine }
}

describe("DependencyEngine", () => {
  test("add + outgoing/incoming", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a" })
    const b = store.create({ kind: "task", title: "b" })
    engine.add({ from: b.id, to: a.id, type: "blocked_by" })
    expect(engine.outgoing(b.id)).toHaveLength(1)
    expect(engine.incoming(a.id)).toHaveLength(1)
  })

  test("self-loop rejected", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a" })
    expect(() => engine.add({ from: a.id, to: a.id, type: "blocks" })).toThrow(
      InvalidDependencyError,
    )
  })

  test("cycle rejected for blocking edges", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a" })
    const b = store.create({ kind: "task", title: "b" })
    engine.add({ from: b.id, to: a.id, type: "blocked_by" })
    expect(() => engine.add({ from: a.id, to: b.id, type: "blocked_by" })).toThrow(WorkCycleError)
  })

  test("related_to does not create cycle", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a" })
    const b = store.create({ kind: "task", title: "b" })
    engine.add({ from: b.id, to: a.id, type: "blocked_by" })
    engine.add({ from: a.id, to: b.id, type: "related_to" })
    expect(engine.outgoing(a.id).some((d) => d.type === "related_to")).toBe(true)
  })

  test("isBlocked true until blocker done", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a" })
    const b = store.create({ kind: "task", title: "b" })
    engine.add({ from: b.id, to: a.id, type: "blocked_by" })
    expect(engine.isBlocked(b.id)).toBe(true)
    store.patch(a.id, { status: "done" })
    expect(engine.isBlocked(b.id)).toBe(false)
  })

  test("criticalPath computes longest path + slack", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a", estimateMs: 3 })
    const b = store.create({ kind: "task", title: "b", estimateMs: 5 })
    const c = store.create({ kind: "task", title: "c", estimateMs: 2 })
    const d = store.create({ kind: "task", title: "d", estimateMs: 4 })
    // a → b → d (3+5+4=12) and a → c → d (3+2+4=9)
    engine.add({ from: b.id, to: a.id, type: "finish_to_start" })
    engine.add({ from: c.id, to: a.id, type: "finish_to_start" })
    engine.add({ from: d.id, to: b.id, type: "finish_to_start" })
    engine.add({ from: d.id, to: c.id, type: "finish_to_start" })
    const result = engine.criticalPath([d.id])
    expect(result.totalMs).toBe(12)
    expect(result.items).toContain(b.id)
    expect(result.items).toContain(d.id)
    expect(result.items).toContain(a.id)
    expect(result.items).not.toContain(c.id)
    expect(result.slack.get(c.id)).toBeGreaterThan(0)
  })

  test("dependency_added + dependency_removed events fire", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a" })
    const b = store.create({ kind: "task", title: "b" })
    const seen: string[] = []
    engine.events.on("dependency_added", () => seen.push("add"))
    engine.events.on("dependency_removed", () => seen.push("remove"))
    const dep = engine.add({ from: b.id, to: a.id, type: "blocked_by" })
    engine.remove(dep.id)
    expect(seen).toEqual(["add", "remove"])
  })

  test("dependency_satisfied emitted by markSatisfied", () => {
    const { store, engine } = setup()
    const a = store.create({ kind: "task", title: "a" })
    const b = store.create({ kind: "task", title: "b" })
    const dep = engine.add({ from: b.id, to: a.id, type: "blocked_by" })
    let called = false
    engine.events.on("dependency_satisfied", () => {
      called = true
    })
    engine.markSatisfied(dep.id)
    expect(called).toBe(true)
  })
})
