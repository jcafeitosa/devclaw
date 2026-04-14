import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SqliteVectorAdapter } from "../../src/adapter/vector.ts"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import type { MemoryItem } from "../../src/memory/types.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

function mk(id: string, content: string, tags: string[] = [], pinned = false): MemoryItem {
  const now = Date.now()
  return {
    id,
    kind: "fact",
    content,
    tags,
    pinned,
    createdAt: now,
    lastUsedAt: now,
    useCount: 0,
  }
}

describe("InMemoryLongTerm", () => {
  const embedder = new HashEmbedder({ dim: 256 })

  test("write + get by id", async () => {
    const s = new InMemoryLongTerm({ embedder })
    await s.write(mk("a", "apple"))
    expect((await s.get("a"))?.content).toBe("apple")
  })

  test("recall can hydrate from sqlite vector storage after restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-long-term-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "vectors.db")

    const first = new InMemoryLongTerm({
      embedder,
      vector: new SqliteVectorAdapter({ sqlitePath }),
    })
    await first.write(mk("a", "postgres migration strategy"))
    await first.write(mk("b", "react component lifecycle"))

    const second = new InMemoryLongTerm({
      embedder,
      vector: new SqliteVectorAdapter({ sqlitePath }),
    })
    const hits = await second.recall({ text: "postgres schema migration", limit: 1 })
    expect(hits[0]?.item.id).toBe("a")
    expect(hits[0]?.item.content).toContain("postgres")
  })

  test("recall returns similar items ranked by cosine", async () => {
    const s = new InMemoryLongTerm({ embedder })
    await s.write(mk("a", "postgres migration strategy"))
    await s.write(mk("b", "react component lifecycle"))
    await s.write(mk("c", "postgres schema upgrade"))
    const hits = await s.recall({ text: "postgres schema migration", limit: 2 })
    expect(hits.length).toBeLessThanOrEqual(2)
    expect(hits[0]?.item.id).toBe("a")
    expect(hits[0]?.score).toBeGreaterThan(0)
  })

  test("recall respects tags filter", async () => {
    const s = new InMemoryLongTerm({ embedder })
    await s.write(mk("a", "postgres stuff", ["db"]))
    await s.write(mk("b", "postgres stuff", ["ui"]))
    const hits = await s.recall({ text: "postgres", tags: ["db"] })
    expect(hits.map((h) => h.item.id)).toEqual(["a"])
  })

  test("recall respects minScore", async () => {
    const s = new InMemoryLongTerm({ embedder })
    await s.write(mk("a", "totally unrelated content"))
    const hits = await s.recall({ text: "postgres migration", minScore: 0.99 })
    expect(hits).toEqual([])
  })

  test("search by keyword + tag + since", async () => {
    const s = new InMemoryLongTerm({ embedder })
    await s.write(mk("a", "hello world", ["greet"]))
    await s.write(mk("b", "goodbye", ["bye"]))
    expect((await s.search({ text: "hello" })).map((i) => i.id)).toEqual(["a"])
    expect((await s.search({ tags: ["bye"] })).map((i) => i.id)).toEqual(["b"])
  })

  test("prune removes stale non-pinned", async () => {
    const s = new InMemoryLongTerm({ embedder })
    const stale: MemoryItem = {
      ...mk("a", "stale"),
      lastUsedAt: Date.now() - 1_000_000,
    }
    const fresh = mk("b", "fresh")
    const pinned = { ...mk("c", "keep me", [], true), lastUsedAt: 0 }
    await s.write(stale)
    await s.write(fresh)
    await s.write(pinned)
    const removed = await s.prune({ maxAgeMs: 500_000 })
    expect(removed).toContain("a")
    expect(removed).not.toContain("b")
    expect(removed).not.toContain("c")
  })

  test("list returns all", async () => {
    const s = new InMemoryLongTerm({ embedder })
    await s.write(mk("a", "x"))
    await s.write(mk("b", "y"))
    expect((await s.list()).length).toBe(2)
  })
})
