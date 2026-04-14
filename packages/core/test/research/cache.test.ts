import { describe, expect, test } from "bun:test"
import { ResearchCache } from "../../src/research/cache.ts"
import type { Document } from "../../src/research/types.ts"

function doc(id: string): Document {
  return {
    id,
    sourceId: "s",
    tier: "official-docs",
    title: id,
    content: "x",
    fetchedAt: 0,
  }
}

describe("ResearchCache", () => {
  test("set + get roundtrips + clones entries", () => {
    const c = new ResearchCache()
    const d = doc("a")
    c.set("postgres", "official-docs", [d])
    const out = c.get("postgres", "official-docs")
    expect(out?.[0]?.id).toBe("a")
    // Mutation of returned docs doesn't affect cached copies
    out![0]!.id = "b"
    const again = c.get("postgres", "official-docs")
    expect(again?.[0]?.id).toBe("a")
  })

  test("expires after TTL", () => {
    const c = new ResearchCache({ ttlByTier: { "official-docs": 100 } })
    c.set("q", "official-docs", [doc("a")])
    const later = Date.now() + 1_000
    expect(c.get("q", "official-docs", later)).toBeNull()
  })

  test("LRU evicts oldest when maxEntries exceeded", () => {
    const c = new ResearchCache({ maxEntries: 2 })
    c.set("a", "search", [doc("1")])
    c.set("b", "search", [doc("2")])
    c.set("c", "search", [doc("3")])
    expect(c.size()).toBe(2)
    expect(c.get("a", "search")).toBeNull()
  })

  test("invalidate(all) clears cache", () => {
    const c = new ResearchCache()
    c.set("a", "search", [doc("1")])
    c.invalidate()
    expect(c.size()).toBe(0)
  })

  test("invalidate(tier) clears only tier entries", () => {
    const c = new ResearchCache()
    c.set("q", "github", [doc("g")])
    c.set("q", "official-docs", [doc("d")])
    c.invalidate(undefined, "github")
    expect(c.get("q", "github")).toBeNull()
    expect(c.get("q", "official-docs")).not.toBeNull()
  })
})
