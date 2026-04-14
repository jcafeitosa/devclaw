import { describe, expect, test } from "bun:test"
import { InvalidLinkError, ThreadClosedError } from "../../src/comm/errors.ts"
import { ThreadStore } from "../../src/comm/thread.ts"

describe("ThreadStore", () => {
  test("create requires default required links (projectId)", () => {
    const s = new ThreadStore()
    expect(() => s.create({ channelId: "c", title: "t", openedBy: "a", links: {} })).toThrow(
      InvalidLinkError,
    )
    const t = s.create({
      channelId: "c",
      title: "t",
      openedBy: "a",
      links: { projectId: "p1" },
    })
    expect(t.id).toMatch(/^th_/)
    expect(t.open).toBe(true)
  })

  test("custom requiredLinks enforced", () => {
    const s = new ThreadStore({ requiredLinks: ["projectId", "taskId"] })
    expect(() =>
      s.create({
        channelId: "c",
        title: "t",
        openedBy: "a",
        links: { projectId: "p" },
      }),
    ).toThrow(/taskId/)
  })

  test("listByChannel filters", () => {
    const s = new ThreadStore()
    s.create({ channelId: "a", title: "t1", openedBy: "x", links: { projectId: "p" } })
    s.create({ channelId: "b", title: "t2", openedBy: "x", links: { projectId: "p" } })
    expect(s.listByChannel("a")).toHaveLength(1)
  })

  test("close + reopen toggles state", () => {
    const s = new ThreadStore()
    const t = s.create({
      channelId: "c",
      title: "t",
      openedBy: "x",
      links: { projectId: "p" },
    })
    s.close(t.id, "x", "resolved")
    expect(s.get(t.id).open).toBe(false)
    expect(s.get(t.id).closedReason).toBe("resolved")
    expect(() => s.close(t.id, "x")).toThrow(ThreadClosedError)
    s.reopen(t.id)
    expect(s.get(t.id).open).toBe(true)
  })
})
