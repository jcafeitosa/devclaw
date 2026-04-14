import { describe, expect, test } from "bun:test"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import { MemoryService } from "../../src/memory/service.ts"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"

function makeService() {
  const embedder = new HashEmbedder({ dim: 256 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

describe("MemoryService", () => {
  test("write to long-term + recall", async () => {
    const s = makeService()
    await s.write({
      tier: "long",
      content: "postgres schema migrations via drizzle",
      tags: ["db"],
    })
    const hits = await s.recall({ text: "postgres schema migrations", limit: 1 })
    expect(hits[0]?.item.content).toContain("postgres")
  })

  test("write to short-term + recall session-scoped", async () => {
    const s = makeService()
    await s.write({
      tier: "short",
      sessionId: "s1",
      content: "user preference: verbose logs",
    })
    const hits = await s.recall({ text: "user preference", sessionId: "s1", limit: 5 })
    expect(hits.some((h) => h.item.content.includes("verbose"))).toBe(true)
  })

  test("search combines long-term keyword + short-term session when requested", async () => {
    const s = makeService()
    await s.write({ tier: "long", content: "hello long term" })
    await s.write({ tier: "short", sessionId: "s1", content: "hello short" })
    const results = await s.search({ text: "hello", sessionId: "s1" })
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  test("episode appends + query", async () => {
    const s = makeService()
    await s.recordEpisode({
      id: "e1",
      taskId: "t1",
      outcome: "success",
      content: "worked",
      at: Date.now(),
    })
    const eps = await s.episodes({ taskId: "t1" })
    expect(eps.length).toBe(1)
  })

  test("inject returns ContextItems ready for ContextAssembler", async () => {
    const s = makeService()
    await s.write({ tier: "long", content: "postgres docs" })
    const items = await s.inject({ text: "postgres", limit: 3 })
    expect(items[0]?.kind).toBe("memory")
    expect(items[0]?.sourceId).toBe("memory")
    expect(items[0]?.content).toContain("postgres")
  })

  test("prune removes stale non-pinned from long term", async () => {
    const s = makeService()
    const past = Date.now() - 10_000_000
    await s.write({ tier: "long", content: "stale note", at: past })
    const removed = await s.prune({ maxAgeMs: 5_000_000 })
    expect(removed.longTerm.length).toBeGreaterThanOrEqual(1)
  })

  test("flush is a no-op for in-memory impls but resolves", async () => {
    const s = makeService()
    await expect(s.flush()).resolves.toBeUndefined()
  })
})
