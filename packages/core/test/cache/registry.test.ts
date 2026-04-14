import { describe, expect, test } from "bun:test"
import { CacheRegistry, DEFAULT_LAYERS } from "../../src/cache/registry.ts"

describe("CacheRegistry — defaults", () => {
  test("ships with the 5 vault-spec layers", () => {
    const r = new CacheRegistry()
    const names = r.list().sort()
    expect(names).toEqual([...DEFAULT_LAYERS].sort())
  })

  test("get(layer) returns a cache; basic round-trip works", async () => {
    const r = new CacheRegistry()
    const c = r.get("response")
    await c.set("req-1", { ok: true })
    expect(await c.get("req-1")).toEqual({ ok: true })
  })
})

describe("CacheRegistry — custom layers", () => {
  test("register overrides default layer", async () => {
    const r = new CacheRegistry()
    const seen: string[] = []
    r.register("response", {
      async get(k) {
        seen.push(`get ${k}`)
        return undefined
      },
      async set(k) {
        seen.push(`set ${k}`)
      },
      async has() {
        return false
      },
      async delete() {},
      async clear() {},
      stats() {
        return { hits: 0, misses: 0, size: 0, hitRate: 0 }
      },
    })
    await r.get("response").set("k", { x: 1 })
    expect(seen).toEqual(["set k"])
  })

  test("get on unknown layer throws", () => {
    const r = new CacheRegistry()
    expect(() => r.get("ghost")).toThrow(/no cache layer/)
  })

  test("totalsStats aggregates hit rate across layers", async () => {
    const r = new CacheRegistry()
    const a = r.get("prefix")
    const b = r.get("response")
    await a.set("k", 1)
    await a.get("k") // hit
    await a.get("none") // miss
    await b.get("none") // miss
    const t = r.totalStats()
    expect(t.hits).toBe(1)
    expect(t.misses).toBe(2)
    expect(t.hitRate).toBeCloseTo(1 / 3, 4)
  })
})
