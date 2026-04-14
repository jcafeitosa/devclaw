import { describe, expect, test } from "bun:test"
import { BridgeRegistry } from "../../src/bridge/registry.ts"
import type {
  AuthStatus,
  Bridge,
  BridgeEvent,
  BridgeRequest,
  Capabilities,
  CostEstimate,
} from "../../src/bridge/types.ts"

function mock(cli: string, overrides: Partial<Bridge> = {}): Bridge {
  const base: Bridge = {
    cli,
    async isAvailable() {
      return true
    },
    async isAuthenticated(): Promise<AuthStatus> {
      return { authed: true }
    },
    capabilities(): Capabilities {
      return {
        modes: ["agentic"],
        contextWindow: 200_000,
        supportsTools: true,
        supportsSubagents: true,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsWebSearch: false,
        supportsMcp: true,
        preferredFor: ["code"],
      }
    },
    estimateCost(): CostEstimate {
      return { costUsd: 0, tokensIn: 0, tokensOut: 0, subscriptionCovered: true }
    },
    execute(): AsyncIterable<BridgeEvent> {
      return (async function* () {})()
    },
    async cancel() {},
  }
  return { ...base, ...overrides }
}

const req: BridgeRequest = {
  taskId: "t1",
  agentId: "a",
  cli: "claude",
  cwd: "/tmp",
  prompt: "do",
}

describe("BridgeRegistry", () => {
  test("register + get + list", () => {
    const r = new BridgeRegistry()
    r.register(mock("claude"))
    r.register(mock("codex"))
    expect(
      r
        .list()
        .map((b) => b.cli)
        .sort(),
    ).toEqual(["claude", "codex"])
  })

  test("select picks first available matching cli", async () => {
    const r = new BridgeRegistry()
    r.register(mock("claude"))
    const chosen = await r.select({ ...req, cli: "claude" })
    expect(chosen?.cli).toBe("claude")
  })

  test("select returns null when preferred cli unavailable", async () => {
    const r = new BridgeRegistry()
    r.register(mock("claude", { isAvailable: async () => false }))
    expect(await r.select({ ...req, cli: "claude" })).toBeNull()
  })

  test("selectByCapability picks lowest cost among capable bridges", async () => {
    const r = new BridgeRegistry()
    r.register(
      mock("a", {
        estimateCost: () => ({
          costUsd: 0.05,
          tokensIn: 0,
          tokensOut: 0,
          subscriptionCovered: false,
        }),
      }),
    )
    r.register(
      mock("b", {
        estimateCost: () => ({ costUsd: 0, tokensIn: 0, tokensOut: 0, subscriptionCovered: true }),
      }),
    )
    const chosen = await r.selectByCapability(req, (c) => c.supportsTools)
    expect(chosen?.cli).toBe("b")
  })

  test("selectByCapability filters by capability predicate", async () => {
    const r = new BridgeRegistry()
    r.register(
      mock("x", {
        capabilities: () => ({ ...mock("x").capabilities(), supportsWebSearch: false }),
      }),
    )
    r.register(
      mock("y", { capabilities: () => ({ ...mock("y").capabilities(), supportsWebSearch: true }) }),
    )
    const chosen = await r.selectByCapability(req, (c) => c.supportsWebSearch)
    expect(chosen?.cli).toBe("y")
  })

  test("excludes unauthenticated bridges", async () => {
    const r = new BridgeRegistry()
    r.register(mock("x", { isAuthenticated: async () => ({ authed: false }) }))
    r.register(mock("y"))
    const chosen = await r.selectByCapability(req, () => true)
    expect(chosen?.cli).toBe("y")
  })
})
