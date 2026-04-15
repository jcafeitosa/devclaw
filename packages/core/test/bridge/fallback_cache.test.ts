import { describe, expect, test } from "bun:test"

import { BridgeOutputCache, bridgeCacheKey } from "../../src/bridge/cache.ts"
import { FallbackStrategy } from "../../src/bridge/fallback.ts"
import { BridgeRegistry } from "../../src/bridge/registry.ts"
import type { Bridge, BridgeEvent, BridgeRequest, Capabilities } from "../../src/bridge/types.ts"
import { ProviderCatalog } from "../../src/provider/catalog.ts"

function bridgeStub(events: BridgeEvent[], counter: { calls: number }): Bridge {
  return {
    cli: "claude",
    async isAvailable() {
      return true
    },
    async isAuthenticated() {
      return { authed: true }
    },
    capabilities(): Capabilities {
      return {
        modes: ["agentic"],
        contextWindow: 200_000,
        supportsTools: true,
        supportsSubagents: false,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsWebSearch: false,
        supportsMcp: false,
        preferredFor: [],
      }
    },
    estimateCost() {
      return { costUsd: 0, tokensIn: 0, tokensOut: 0, subscriptionCovered: true }
    },
    execute(): AsyncIterable<BridgeEvent> {
      counter.calls++
      return (async function* () {
        for (const ev of events) yield ev
      })()
    },
    async cancel() {},
  }
}

async function drain(iter: AsyncIterable<BridgeEvent>): Promise<BridgeEvent[]> {
  const out: BridgeEvent[] = []
  for await (const ev of iter) out.push(ev)
  return out
}

const req: BridgeRequest = {
  taskId: "task-c",
  agentId: "agent-c",
  cli: "claude",
  cwd: "/tmp/p",
  prompt: "summarize",
}

describe("FallbackStrategy — BridgeOutputCache integration", () => {
  test("cache miss: executes bridge + fills cache", async () => {
    const registry = new BridgeRegistry()
    const counter = { calls: 0 }
    registry.register(
      bridgeStub([{ type: "text", content: "hello" }, { type: "completed" }], counter),
    )
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    const strategy = new FallbackStrategy({
      registry,
      catalog: new ProviderCatalog(),
      cache,
      gitHead: async () => "abc123",
    })
    const events = await drain(strategy.execute(req))
    expect(events.map((e) => e.type)).toEqual(["text", "completed"])
    expect(counter.calls).toBe(1)
    const key = bridgeCacheKey(req, "abc123")
    expect(await cache.get(key)).toEqual([
      { type: "text", content: "hello" },
      { type: "completed" },
    ])
  })

  test("cache hit: replays events without calling bridge", async () => {
    const registry = new BridgeRegistry()
    const counter = { calls: 0 }
    registry.register(
      bridgeStub([{ type: "text", content: "should-not-run" }, { type: "completed" }], counter),
    )
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    const key = bridgeCacheKey(req, "abc123")
    await cache.set(key, [{ type: "text", content: "cached" }, { type: "completed" }])
    const strategy = new FallbackStrategy({
      registry,
      catalog: new ProviderCatalog(),
      cache,
      gitHead: async () => "abc123",
    })
    const events = await drain(strategy.execute(req))
    expect(events).toEqual([{ type: "text", content: "cached" }, { type: "completed" }])
    expect(counter.calls).toBe(0)
  })

  test("different gitHead → no cache hit, bridge runs", async () => {
    const registry = new BridgeRegistry()
    const counter = { calls: 0 }
    registry.register(
      bridgeStub([{ type: "text", content: "fresh" }, { type: "completed" }], counter),
    )
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    await cache.set(bridgeCacheKey(req, "abc"), [
      { type: "text", content: "stale" },
      { type: "completed" },
    ])
    const strategy = new FallbackStrategy({
      registry,
      catalog: new ProviderCatalog(),
      cache,
      gitHead: async () => "def", // different HEAD
    })
    const events = await drain(strategy.execute(req))
    expect(events).toEqual([{ type: "text", content: "fresh" }, { type: "completed" }])
    expect(counter.calls).toBe(1)
  })

  test("events with type 'error' are NOT cached", async () => {
    const registry = new BridgeRegistry()
    const counter = { calls: 0 }
    registry.register(
      bridgeStub(
        [
          { type: "text", content: "partial" },
          { type: "error", message: "boom", recoverable: false },
        ],
        counter,
      ),
    )
    const cache = new BridgeOutputCache({ maxEntries: 4 })
    const strategy = new FallbackStrategy({
      registry,
      catalog: new ProviderCatalog(),
      cache,
      gitHead: async () => "abc",
    })
    await drain(strategy.execute(req))
    const key = bridgeCacheKey(req, "abc")
    expect(await cache.get(key)).toBeNull()
  })
})
