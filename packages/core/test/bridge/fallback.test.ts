import { describe, expect, test } from "bun:test"
import { FallbackStrategy } from "../../src/bridge/fallback.ts"
import { BridgeRegistry } from "../../src/bridge/registry.ts"
import type {
  AuthStatus,
  Bridge,
  BridgeEvent,
  BridgeRequest,
  Capabilities,
} from "../../src/bridge/types.ts"
import { MemoryAuditSink } from "../../src/audit/sink.ts"
import { SafetyKernel } from "../../src/kernel/index.ts"
import { PermissionEvaluator } from "../../src/permission/evaluator.ts"
import { ProviderCatalog } from "../../src/provider/catalog.ts"
import { createDefaultModerator } from "../../src/safety/moderator.ts"
import { RegexPatternModerator } from "../../src/safety/moderator.ts"

function mock(cli: string, opts: Partial<Bridge> = {}): Bridge {
  const events: BridgeEvent[] = [
    { type: "started", at: 1 },
    { type: "text", content: `from ${cli}` },
    { type: "completed" },
  ]
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
      return (async function* () {
        for (const e of events) yield e
      })()
    },
    async cancel() {},
  }
  return { ...base, ...opts }
}

async function collect(iter: AsyncIterable<BridgeEvent>) {
  const out: BridgeEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

const req: BridgeRequest = {
  taskId: "t",
  agentId: "a",
  cli: "claude",
  cwd: "/tmp",
  prompt: "do",
}

describe("FallbackStrategy", () => {
  test("uses preferred bridge when available", async () => {
    const registry = new BridgeRegistry()
    registry.register(mock("claude"))
    const catalog = new ProviderCatalog()
    const f = new FallbackStrategy({ registry, catalog })
    const events = await collect(f.execute(req))
    expect(events.some((e) => e.type === "text" && e.content === "from claude")).toBe(true)
  })

  test("falls back to provider catalog when no bridge matches", async () => {
    const registry = new BridgeRegistry()
    const catalog = new ProviderCatalog()
    catalog.register({
      id: "openai",
      name: "OpenAI",
      baseUrl: "",
      defaultModel: "x",
      async generate() {
        return "fallback-answer"
      },
    })
    const f = new FallbackStrategy({
      registry,
      catalog,
      fallbackProviderId: "openai",
    })
    const events = await collect(f.execute(req))
    const text = events.find((e) => e.type === "text")
    expect(text?.type).toBe("text")
    expect(text && text.type === "text" ? text.content : "").toContain("fallback-answer")
  })

  test("falls back when bridge is unauthenticated", async () => {
    const registry = new BridgeRegistry()
    registry.register(mock("claude", { isAuthenticated: async () => ({ authed: false }) }))
    const catalog = new ProviderCatalog()
    catalog.register({
      id: "openai",
      name: "OpenAI",
      baseUrl: "",
      defaultModel: "x",
      async generate() {
        return "api-fallback"
      },
    })
    const f = new FallbackStrategy({ registry, catalog, fallbackProviderId: "openai" })
    const events = await collect(f.execute(req))
    expect(events.some((e) => e.type === "text" && e.content.includes("api-fallback"))).toBe(true)
  })

  test("throws when no bridge and no fallback configured", async () => {
    const registry = new BridgeRegistry()
    const catalog = new ProviderCatalog()
    const f = new FallbackStrategy({ registry, catalog })
    await expect(collect(f.execute(req))).rejects.toThrow(/no bridge|fallback/i)
  })

  test("emits log event describing fallback path", async () => {
    const registry = new BridgeRegistry()
    const catalog = new ProviderCatalog()
    catalog.register({
      id: "openai",
      name: "x",
      baseUrl: "",
      defaultModel: "x",
      async generate() {
        return "z"
      },
    })
    const f = new FallbackStrategy({ registry, catalog, fallbackProviderId: "openai" })
    const events = await collect(f.execute(req))
    expect(events.some((e) => e.type === "log" && e.message.includes("fallback"))).toBe(true)
  })

  test("blocks execution before bridge/provider when input moderation flags prompt", async () => {
    const registry = new BridgeRegistry()
    registry.register(mock("claude"))
    const catalog = new ProviderCatalog()
    const f = new FallbackStrategy({
      registry,
      catalog,
      moderator: new RegexPatternModerator([
        {
          name: "warn_token",
          category: "prompt_injection",
          pattern: /do/g,
          severity: "warn",
        },
      ]),
    })
    const events = await collect(f.execute(req))
    expect(
      events.some(
        (event) => event.type === "error" && event.message.includes("safety blocked input"),
      ),
    ).toBe(true)
    expect(events.some((event) => event.type === "text")).toBe(false)
  })

  test("routes bridge execution through kernel when configured", async () => {
    const registry = new BridgeRegistry()
    let called = false
    registry.register(
      mock("claude", {
        execute() {
          called = true
          return (async function* () {
            yield { type: "text", content: "from claude" } as BridgeEvent
            yield { type: "completed" } as BridgeEvent
          })()
        },
      }),
    )
    const f = new FallbackStrategy({
      registry,
      catalog: new ProviderCatalog(),
      kernel: new SafetyKernel({
        permission: new PermissionEvaluator({
          rules: [{ tool: "claude", action: "bridge.execute", decision: "deny", reason: "blocked" }],
          defaultDecision: "allow",
        }),
        safety: createDefaultModerator(),
        audit: new MemoryAuditSink(),
      }),
    })
    await expect(collect(f.execute(req))).rejects.toThrow(/permission denied/i)
    expect(called).toBe(false)
  })
})
