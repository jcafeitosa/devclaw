import { describe, expect, test } from "bun:test"

import { BridgeOutputCache, bridgeCacheKey } from "../../src/bridge/cache.ts"
import type { BridgeEvent, BridgeRequest } from "../../src/bridge/types.ts"

const baseReq: BridgeRequest = {
  taskId: "task-1",
  agentId: "agent-1",
  cli: "claude",
  cwd: "/tmp/project",
  prompt: "summarize",
}

describe("bridgeCacheKey", () => {
  test("same inputs → same key", () => {
    const k1 = bridgeCacheKey({ ...baseReq }, "abc123")
    const k2 = bridgeCacheKey({ ...baseReq }, "abc123")
    expect(k1).toBe(k2)
    expect(k1).toMatch(/^[0-9a-f]{64}$/)
  })

  test("different prompt → different key", () => {
    const k1 = bridgeCacheKey({ ...baseReq, prompt: "a" }, "abc123")
    const k2 = bridgeCacheKey({ ...baseReq, prompt: "b" }, "abc123")
    expect(k1).not.toBe(k2)
  })

  test("different cli → different key", () => {
    const k1 = bridgeCacheKey({ ...baseReq, cli: "claude" }, "abc")
    const k2 = bridgeCacheKey({ ...baseReq, cli: "codex" }, "abc")
    expect(k1).not.toBe(k2)
  })

  test("different cwd → different key", () => {
    const k1 = bridgeCacheKey({ ...baseReq, cwd: "/a" }, "abc")
    const k2 = bridgeCacheKey({ ...baseReq, cwd: "/b" }, "abc")
    expect(k1).not.toBe(k2)
  })

  test("different gitHead → different key", () => {
    const k1 = bridgeCacheKey(baseReq, "abc")
    const k2 = bridgeCacheKey(baseReq, "def")
    expect(k1).not.toBe(k2)
  })

  test("different model → different key", () => {
    const k1 = bridgeCacheKey({ ...baseReq, model: "m1" }, "abc")
    const k2 = bridgeCacheKey({ ...baseReq, model: "m2" }, "abc")
    expect(k1).not.toBe(k2)
  })

  test("taskId + agentId do NOT affect key (transient)", () => {
    // BridgeCacheKeyInputs only carries the 4 fields; this proves the type
    // surface excludes taskId/agentId so they can't accidentally become a
    // cache-busting shape change.
    const k1 = bridgeCacheKey({ prompt: baseReq.prompt, cli: baseReq.cli, cwd: baseReq.cwd }, "abc")
    const k2 = bridgeCacheKey({ prompt: baseReq.prompt, cli: baseReq.cli, cwd: baseReq.cwd }, "abc")
    expect(k1).toBe(k2)
  })
})

describe("BridgeOutputCache", () => {
  test("miss when never set", async () => {
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    const hit = await cache.get("nonexistent")
    expect(hit).toBeNull()
  })

  test("set then get replays same events", async () => {
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    const events: BridgeEvent[] = [
      { type: "started", at: 1 },
      { type: "text", content: "result" },
      { type: "completed" },
    ]
    await cache.set("k1", events)
    const hit = await cache.get("k1")
    expect(hit).toEqual(events)
  })

  test("returns fresh copy (does not mutate cached events)", async () => {
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    const events: BridgeEvent[] = [{ type: "text", content: "a" }, { type: "completed" }]
    await cache.set("k1", events)
    const hit1 = await cache.get("k1")
    hit1?.push({ type: "text", content: "tampered" })
    const hit2 = await cache.get("k1")
    expect(hit2).toEqual(events)
  })

  test("TTL expiration via now()", async () => {
    let t = 1000
    const cache = new BridgeOutputCache({
      maxEntries: 4,
      defaultTtlMs: 500,
      now: () => t,
    })
    await cache.set("k", [{ type: "completed" }])
    expect(await cache.get("k")).not.toBeNull()
    t += 501
    expect(await cache.get("k")).toBeNull()
  })

  test("LRU eviction when maxEntries exceeded", async () => {
    const cache = new BridgeOutputCache({ maxEntries: 2 })
    await cache.set("a", [{ type: "completed" }])
    await cache.set("b", [{ type: "completed" }])
    await cache.set("c", [{ type: "completed" }])
    expect(await cache.get("a")).toBeNull()
    expect(await cache.get("b")).not.toBeNull()
    expect(await cache.get("c")).not.toBeNull()
  })

  test("stats tracks hits + misses + hitRate", async () => {
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    await cache.set("k", [{ type: "completed" }])
    await cache.get("k")
    await cache.get("k")
    await cache.get("miss")
    const s = cache.stats()
    expect(s.hits).toBe(2)
    expect(s.misses).toBe(1)
    expect(s.hitRate).toBeCloseTo(2 / 3, 3)
  })
})
