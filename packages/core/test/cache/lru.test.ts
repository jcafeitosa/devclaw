import { describe, expect, test } from "bun:test"
import { LruTtlCache } from "../../src/cache/lru.ts"

describe("LruTtlCache — basic ops", () => {
  test("set + get + has", async () => {
    const c = new LruTtlCache<string>({ maxEntries: 10 })
    await c.set("k", "v")
    expect(await c.get("k")).toBe("v")
    expect(await c.has("k")).toBe(true)
  })

  test("get returns undefined for missing key", async () => {
    const c = new LruTtlCache<string>({ maxEntries: 10 })
    expect(await c.get("nope")).toBeUndefined()
  })

  test("delete removes entry", async () => {
    const c = new LruTtlCache<string>({ maxEntries: 10 })
    await c.set("k", "v")
    await c.delete("k")
    expect(await c.has("k")).toBe(false)
  })

  test("clear empties the cache", async () => {
    const c = new LruTtlCache<string>({ maxEntries: 10 })
    await c.set("a", "1")
    await c.set("b", "2")
    await c.clear()
    expect(await c.get("a")).toBeUndefined()
    expect(await c.get("b")).toBeUndefined()
  })
})

describe("LruTtlCache — eviction", () => {
  test("evicts least recently used when over capacity", async () => {
    const c = new LruTtlCache<number>({ maxEntries: 2 })
    await c.set("a", 1)
    await c.set("b", 2)
    await c.get("a") // touch a so b is LRU
    await c.set("c", 3) // evicts b
    expect(await c.has("a")).toBe(true)
    expect(await c.has("b")).toBe(false)
    expect(await c.has("c")).toBe(true)
  })
})

describe("LruTtlCache — TTL", () => {
  test("entries expire after default ttlMs", async () => {
    let now = 1000
    const c = new LruTtlCache<string>({ maxEntries: 10, defaultTtlMs: 50, now: () => now })
    await c.set("k", "v")
    now = 1040
    expect(await c.get("k")).toBe("v")
    now = 1100
    expect(await c.get("k")).toBeUndefined()
  })

  test("per-set ttl overrides default", async () => {
    let now = 0
    const c = new LruTtlCache<string>({ maxEntries: 10, defaultTtlMs: 1000, now: () => now })
    await c.set("k", "v", { ttlMs: 10 })
    now = 50
    expect(await c.get("k")).toBeUndefined()
  })

  test("ttlMs=0 means no expiry", async () => {
    let now = 0
    const c = new LruTtlCache<string>({ maxEntries: 10, defaultTtlMs: 0, now: () => now })
    await c.set("k", "v")
    now = 10_000_000
    expect(await c.get("k")).toBe("v")
  })
})

describe("LruTtlCache — stats", () => {
  test("hit/miss counters update on get", async () => {
    const c = new LruTtlCache<string>({ maxEntries: 10 })
    await c.set("k", "v")
    await c.get("k") // hit
    await c.get("k") // hit
    await c.get("none") // miss
    const s = c.stats()
    expect(s.hits).toBe(2)
    expect(s.misses).toBe(1)
    expect(s.size).toBe(1)
    expect(s.hitRate).toBeCloseTo(2 / 3, 4)
  })

  test("stats reset on clear", async () => {
    const c = new LruTtlCache<string>({ maxEntries: 10 })
    await c.set("k", "v")
    await c.get("k")
    await c.clear()
    expect(c.stats().hits).toBe(0)
    expect(c.stats().size).toBe(0)
  })
})
