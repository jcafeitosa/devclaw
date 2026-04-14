import { describe, expect, test } from "bun:test"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import { MemoryService } from "../../src/memory/service.ts"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"
import { persistLessons } from "../../src/reflection/learning.ts"
import type { Lesson } from "../../src/reflection/types.ts"

function svc() {
  const embedder = new HashEmbedder({ dim: 64 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

describe("persistLessons", () => {
  test("writes each lesson to long-term with kind=lesson", async () => {
    const s = svc()
    const lessons: Lesson[] = [
      {
        id: "l1",
        content: "avoid step order",
        tags: ["reflection", "migration"],
        source: "reflection",
        relatesTo: { taskId: "t1", stepIds: ["a"] },
      },
    ]
    const ids = await persistLessons(s, lessons)
    expect(ids).toHaveLength(1)
    const hits = await s.recall({ text: "avoid step order" })
    expect(hits.some((h) => h.item.content.includes("avoid"))).toBe(true)
    expect(hits[0]?.item.kind).toBe("lesson")
  })

  test("merges provided tags with [taskId, lesson]", async () => {
    const s = svc()
    const out = await persistLessons(s, [
      {
        id: "l2",
        content: "x",
        tags: ["custom"],
        source: "reflection",
        relatesTo: { taskId: "task-123", stepIds: [] },
      },
    ])
    const items = await s.search({ tags: ["task-123"] })
    expect(items.length).toBe(1)
    expect(items[0]?.tags.sort()).toEqual(["custom", "lesson", "task-123"].sort())
    expect(out[0]).toEqual(items[0]!.id)
  })
})
