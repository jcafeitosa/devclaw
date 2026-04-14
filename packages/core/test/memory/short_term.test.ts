import { describe, expect, test } from "bun:test"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"

function item(id: string, content: string) {
  return {
    id,
    kind: "fragment" as const,
    content,
    tags: [],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    useCount: 0,
  }
}

describe("InMemoryShortTerm", () => {
  test("put + get roundtrips", async () => {
    const s = new InMemoryShortTerm({ defaultTtlMs: 60_000 })
    await s.put("sess", item("a", "hello"))
    const got = await s.get("sess", "a")
    expect(got?.content).toBe("hello")
  })

  test("get bumps useCount + lastUsedAt", async () => {
    const s = new InMemoryShortTerm({ defaultTtlMs: 60_000 })
    await s.put("sess", item("a", "x"))
    const first = await s.get("sess", "a")
    const second = await s.get("sess", "a")
    expect(second?.useCount).toBe(2)
    expect(second?.lastUsedAt ?? 0).toBeGreaterThanOrEqual(first?.lastUsedAt ?? 0)
  })

  test("expires after ttl", async () => {
    const s = new InMemoryShortTerm({ defaultTtlMs: 10 })
    await s.put("sess", item("a", "x"))
    await Bun.sleep(20)
    expect(await s.get("sess", "a")).toBeNull()
  })

  test("listSession filters expired + returns live", async () => {
    const s = new InMemoryShortTerm({ defaultTtlMs: 30 })
    await s.put("sess", item("a", "live"))
    await s.put("sess", item("b", "dying"), 5)
    await Bun.sleep(15)
    const live = await s.list("sess")
    expect(live.map((i) => i.id)).toEqual(["a"])
  })

  test("clear removes session", async () => {
    const s = new InMemoryShortTerm({ defaultTtlMs: 1_000 })
    await s.put("sess", item("a", "x"))
    await s.clear("sess")
    expect(await s.get("sess", "a")).toBeNull()
  })

  test("sessions isolated", async () => {
    const s = new InMemoryShortTerm({ defaultTtlMs: 1_000 })
    await s.put("s1", item("a", "one"))
    await s.put("s2", item("a", "two"))
    expect((await s.get("s1", "a"))?.content).toBe("one")
    expect((await s.get("s2", "a"))?.content).toBe("two")
  })
})
