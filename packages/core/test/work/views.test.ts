import { describe, expect, test } from "bun:test"
import { DependencyEngine } from "../../src/work/dependencies.ts"
import { WorkItemStore } from "../../src/work/store.ts"
import { toGanttView, toKanbanView, toListView } from "../../src/work/views.ts"

describe("views", () => {
  test("toListView filters by kind/status/tag", () => {
    const s = new WorkItemStore()
    s.create({ kind: "task", title: "a", status: "ready", tags: ["fe"] })
    s.create({ kind: "task", title: "b", status: "done", tags: ["fe"] })
    s.create({ kind: "epic", title: "e", status: "ready" })
    expect(toListView(s, { kind: ["task"] }).length).toBe(2)
    expect(toListView(s, { status: ["done"] }).length).toBe(1)
    expect(toListView(s, { tag: "fe" }).length).toBe(2)
  })

  test("toListView sorted desc by createdAt", async () => {
    const s = new WorkItemStore()
    s.create({ kind: "task", title: "first" })
    await Bun.sleep(2)
    s.create({ kind: "task", title: "second" })
    expect(toListView(s)[0]?.title).toBe("second")
  })

  test("toKanbanView groups by status", () => {
    const s = new WorkItemStore()
    s.create({ kind: "task", title: "a", status: "ready" })
    s.create({ kind: "task", title: "b", status: "ready" })
    s.create({ kind: "task", title: "c", status: "done" })
    const view = toKanbanView(s, "status")
    const columns = Object.fromEntries(view.columns.map((c) => [c.key, c.items.length]))
    expect(columns.ready).toBe(2)
    expect(columns.done).toBe(1)
  })

  test("toKanbanView handles missing field as 'unassigned'", () => {
    const s = new WorkItemStore()
    s.create({ kind: "task", title: "a" })
    const view = toKanbanView(s, "owner")
    expect(view.columns[0]?.key).toBe("unassigned")
  })

  test("toGanttView marks critical path bars", () => {
    const s = new WorkItemStore()
    const deps = new DependencyEngine(s)
    const a = s.create({ kind: "task", title: "a", estimateMs: 5, startAt: 0 })
    const b = s.create({ kind: "task", title: "b", estimateMs: 3, startAt: 0 })
    deps.add({ from: a.id, to: b.id, type: "finish_to_start" })
    const view = toGanttView(s, deps, [a.id], 0)
    expect(view.bars.find((bar) => bar.id === a.id)?.onCriticalPath).toBe(true)
  })
})
