import { describe, expect, test } from "bun:test"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import type { Episode } from "../../src/memory/types.ts"

function ep(id: string, taskId: string, outcome: Episode["outcome"], at: number): Episode {
  return { id, taskId, outcome, content: "", at }
}

describe("InMemoryEpisodic", () => {
  test("append preserves insertion order", async () => {
    const e = new InMemoryEpisodic()
    await e.append(ep("a", "t1", "success", 100))
    await e.append(ep("b", "t1", "failure", 200))
    await e.append(ep("c", "t2", "success", 300))
    const all = await e.all()
    expect(all.map((x) => x.id)).toEqual(["a", "b", "c"])
  })

  test("query by taskId filters", async () => {
    const e = new InMemoryEpisodic()
    await e.append(ep("a", "t1", "success", 1))
    await e.append(ep("b", "t2", "success", 2))
    const hits = await e.query({ taskId: "t1" })
    expect(hits.map((h) => h.id)).toEqual(["a"])
  })

  test("query by time range", async () => {
    const e = new InMemoryEpisodic()
    await e.append(ep("a", "t", "success", 100))
    await e.append(ep("b", "t", "success", 200))
    await e.append(ep("c", "t", "success", 300))
    const hits = await e.query({ since: 150, until: 250 })
    expect(hits.map((h) => h.id)).toEqual(["b"])
  })

  test("query by outcome", async () => {
    const e = new InMemoryEpisodic()
    await e.append(ep("a", "t", "success", 1))
    await e.append(ep("b", "t", "failure", 2))
    expect((await e.query({ outcome: "failure" })).map((h) => h.id)).toEqual(["b"])
  })

  test("query limit + order desc by time by default", async () => {
    const e = new InMemoryEpisodic()
    await e.append(ep("a", "t", "success", 1))
    await e.append(ep("b", "t", "success", 3))
    await e.append(ep("c", "t", "success", 2))
    const hits = await e.query({ limit: 2 })
    expect(hits.map((h) => h.id)).toEqual(["b", "c"])
  })
})
