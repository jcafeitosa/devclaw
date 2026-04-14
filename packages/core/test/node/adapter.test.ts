import { describe, expect, test } from "bun:test"
import {
  CapabilityUnsupportedError,
  LocalNodeAdapter,
  type NodeAdapter,
  NodeAdapterRegistry,
} from "../../src/node/adapter.ts"
import { NodeRegistry } from "../../src/node/registry.ts"

function localNode(id = "local") {
  return {
    id,
    name: id,
    kind: "local" as const,
    capabilities: ["echo", "add"],
    status: "online" as const,
  }
}

describe("LocalNodeAdapter", () => {
  test("execute dispatches to registered capability handler", async () => {
    const adapter = new LocalNodeAdapter({
      node: localNode(),
      capabilities: {
        echo: async (args: unknown) => args,
      },
    })
    const out = await adapter.execute("echo", { hi: 1 })
    expect(out).toEqual({ hi: 1 })
  })

  test("execute throws CapabilityUnsupportedError for undeclared capability", async () => {
    const adapter = new LocalNodeAdapter({ node: localNode(), capabilities: {} })
    await expect(adapter.execute("missing", {})).rejects.toBeInstanceOf(CapabilityUnsupportedError)
  })

  test("execute respects AbortSignal", async () => {
    let aborted = false
    const adapter = new LocalNodeAdapter({
      node: localNode(),
      capabilities: {
        slow: async (_args: unknown, { signal }) => {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => {
              aborted = true
              resolve()
            })
          })
          return null
        },
      },
    })
    const ctrl = new AbortController()
    const p = adapter.execute("slow", {}, { signal: ctrl.signal })
    ctrl.abort()
    await p
    expect(aborted).toBe(true)
  })

  test("advertise returns node snapshot with capabilities", () => {
    const adapter = new LocalNodeAdapter({
      node: localNode(),
      capabilities: { echo: async () => null, add: async () => null },
    })
    const snap = adapter.advertise()
    expect(snap.id).toBe("local")
    expect(snap.capabilities.sort()).toEqual(["add", "echo"])
  })

  test("subscribe receives published events and returns unsubscribe", async () => {
    const adapter = new LocalNodeAdapter({ node: localNode(), capabilities: {} })
    const received: unknown[] = []
    const unsub = adapter.subscribe("topic", (payload) => {
      received.push(payload)
    })
    adapter.publish("topic", { n: 1 })
    adapter.publish("topic", { n: 2 })
    unsub()
    adapter.publish("topic", { n: 3 })
    expect(received).toEqual([{ n: 1 }, { n: 2 }])
  })

  test("publish on unrelated topic does not fire handler", () => {
    const adapter = new LocalNodeAdapter({ node: localNode(), capabilities: {} })
    const received: unknown[] = []
    adapter.subscribe("a", (p) => received.push(p))
    adapter.publish("b", { n: 1 })
    expect(received).toHaveLength(0)
  })
})

describe("NodeAdapterRegistry", () => {
  test("binds adapter to node and routes execute by id", async () => {
    const reg = new NodeAdapterRegistry()
    const adapter = new LocalNodeAdapter({
      node: localNode("worker-1"),
      capabilities: { ping: async () => "pong" },
    })
    reg.bind("worker-1", adapter)
    const r = await reg.execute("worker-1", "ping", {})
    expect(r).toBe("pong")
  })

  test("execute on unknown node id throws", async () => {
    const reg = new NodeAdapterRegistry()
    await expect(reg.execute("ghost", "x", {})).rejects.toThrow(/not bound/)
  })

  test("unbind removes adapter", () => {
    const reg = new NodeAdapterRegistry()
    const adapter = new LocalNodeAdapter({ node: localNode("a"), capabilities: {} })
    reg.bind("a", adapter)
    reg.unbind("a")
    expect(reg.list()).toHaveLength(0)
  })

  test("syncTo writes adapter.advertise() into NodeRegistry", () => {
    const reg = new NodeAdapterRegistry()
    const nodes = new NodeRegistry()
    const adapter = new LocalNodeAdapter({
      node: localNode("worker-2"),
      capabilities: { a: async () => null },
    })
    reg.bind("worker-2", adapter)
    reg.syncTo(nodes)
    const n = nodes.get("worker-2")
    expect(n.capabilities).toContain("a")
    expect(n.status).toBe("online")
  })
})

describe("NodeAdapter — custom implementations compose", () => {
  test("a fake remote adapter conforms to the interface", async () => {
    const remote: NodeAdapter = {
      advertise: () => localNode("remote-1"),
      execute: async (cap) => `remote:${cap}`,
      subscribe: () => () => {},
    }
    const reg = new NodeAdapterRegistry()
    reg.bind("remote-1", remote)
    expect(await reg.execute("remote-1", "ping", {})).toBe("remote:ping")
  })
})
