import { describe, expect, test } from "bun:test"
import { InMemoryIdempotencyStore, runIdempotent } from "../../src/queue/idempotency.ts"

describe("InMemoryIdempotencyStore", () => {
  test("acquire returns true on first call, false on second", async () => {
    const store = new InMemoryIdempotencyStore()
    const first = await store.acquire("key-1", 60_000)
    const second = await store.acquire("key-1", 60_000)
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  test("stores and retrieves cached result", async () => {
    const store = new InMemoryIdempotencyStore()
    await store.acquire("key-2", 60_000)
    await store.putResult("key-2", { ok: true, value: 42 }, 60_000)
    const cached = await store.getResult<{ ok: boolean; value: number }>("key-2")
    expect(cached).toEqual({ ok: true, value: 42 })
  })

  test("returns null for unknown key", async () => {
    const store = new InMemoryIdempotencyStore()
    expect(await store.getResult("missing")).toBeNull()
  })

  test("acquire expires after ttl", async () => {
    const store = new InMemoryIdempotencyStore()
    await store.acquire("key-3", 10)
    await Bun.sleep(20)
    const again = await store.acquire("key-3", 10)
    expect(again).toBe(true)
  })
})

describe("runIdempotent", () => {
  test("runs fn once, returns cached result on duplicate", async () => {
    const store = new InMemoryIdempotencyStore()
    let calls = 0
    const work = async () => {
      calls++
      return { n: calls }
    }
    const r1 = await runIdempotent(store, "k", work)
    const r2 = await runIdempotent(store, "k", work)
    expect(calls).toBe(1)
    expect(r1).toEqual({ n: 1 })
    expect(r2).toEqual({ n: 1 })
  })

  test("different keys run independently", async () => {
    const store = new InMemoryIdempotencyStore()
    const r1 = await runIdempotent(store, "a", async () => 1)
    const r2 = await runIdempotent(store, "b", async () => 2)
    expect(r1).toBe(1)
    expect(r2).toBe(2)
  })
})
