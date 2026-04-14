import { describe, expect, test } from "bun:test"
import { WorkNotFoundError } from "../../src/work/errors.ts"
import { WorkItemStore } from "../../src/work/store.ts"

describe("WorkItemStore", () => {
  test("create + get + patch + delete", () => {
    const s = new WorkItemStore()
    const t = s.create({ kind: "task", title: "hi" })
    expect(s.get(t.id).title).toBe("hi")
    s.patch(t.id, { title: "updated", status: "in_progress" })
    expect(s.get(t.id).title).toBe("updated")
    expect(s.get(t.id).status).toBe("in_progress")
    s.delete(t.id)
    expect(() => s.get(t.id)).toThrow(WorkNotFoundError)
  })

  test("byKind filter", () => {
    const s = new WorkItemStore()
    s.create({ kind: "epic", title: "e1" })
    s.create({ kind: "task", title: "t1" })
    s.create({ kind: "task", title: "t2" })
    expect(s.byKind("task")).toHaveLength(2)
  })

  test("children / descendants / ancestors", () => {
    const s = new WorkItemStore()
    const p = s.create({ kind: "project", title: "p" })
    const e = s.create({ kind: "epic", title: "e", parentId: p.id })
    const t1 = s.create({ kind: "task", title: "t1", parentId: e.id })
    s.create({ kind: "task", title: "t2", parentId: e.id })
    expect(s.children(p.id).map((i) => i.id)).toEqual([e.id])
    expect(s.descendants(p.id).length).toBe(3)
    expect(s.ancestors(t1.id).map((i) => i.id)).toEqual([e.id, p.id])
  })

  test("defaults status=backlog + priority=normal", () => {
    const s = new WorkItemStore()
    const t = s.create({ kind: "task", title: "x" })
    expect(t.status).toBe("backlog")
    expect(t.priority).toBe("normal")
  })
})
