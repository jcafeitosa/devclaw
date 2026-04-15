import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { FilesystemAuthStore } from "../../src/auth/filesystem_store.ts"
import { FallbackStrategy } from "../../src/bridge/fallback.ts"
import { BridgeRegistry } from "../../src/bridge/registry.ts"
import type { Bridge, BridgeEvent, BridgeRequest, Capabilities } from "../../src/bridge/types.ts"
import { CognitiveEngine } from "../../src/cognitive/engine.ts"
import { StubPlanner } from "../../src/cognitive/planner.ts"
import { DefaultReasoner } from "../../src/cognitive/reasoner.ts"
import { ModelRouter } from "../../src/cognitive/router.ts"
import type { StepContext } from "../../src/cognitive/types.ts"
import { discover } from "../../src/discovery/discover.ts"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import { MemoryService } from "../../src/memory/service.ts"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"
import { ProviderCatalog } from "../../src/provider/catalog.ts"
import { ToolExecutor } from "../../src/tool/executor.ts"
import { PermissionChecker } from "../../src/tool/permission.ts"
import { ToolRegistry } from "../../src/tool/registry.ts"

const created: string[] = []

function memoryService(): MemoryService {
  const embedder = new HashEmbedder({ dim: 64 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

function bridgeFor(events: BridgeEvent[]): Bridge {
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
        preferredFor: ["planning"],
      }
    },
    estimateCost() {
      return { costUsd: 0, tokensIn: 10, tokensOut: 10, subscriptionCovered: true }
    },
    execute(_req: BridgeRequest): AsyncIterable<BridgeEvent> {
      return (async function* () {
        for (const event of events) yield event
      })()
    },
    async cancel() {},
  }
}

async function collectText(iter: AsyncIterable<BridgeEvent>): Promise<string> {
  let out = ""
  for await (const event of iter) {
    if (event.type === "text") out += event.content
  }
  return out
}

afterEach(async () => {
  while (created.length > 0) {
    const dir = created.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("core E2E lifecycle", () => {
  test("auth → discover → provider → bridge → cognitive → tool → result", async () => {
    const root = await mkdtemp(join(tmpdir(), "devclaw-e2e-"))
    created.push(root)
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture",
        type: "module",
        devDependencies: { typescript: "^6.0.0" },
      }),
    )
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
    )
    await writeFile(join(root, "README.md"), "# Fixture\n")

    const authStore = new FilesystemAuthStore({ dir: join(root, ".auth"), passphrase: "pw" })
    await authStore.save("openai", { type: "api", key: "sk-e2e-openai" })
    const authItems = await authStore.list()
    expect(authItems.some((item) => item.provider === "openai" && item.type === "api")).toBe(true)

    const report = await discover(root, {
      cli: {
        which: async (name) => (name === "claude" ? `/usr/local/bin/${name}` : null),
        version: async () => "claude 1.0.0",
      },
    })
    expect(report.projectRoot).toBe(root)
    expect(report.clis.claude?.available).toBe(true)

    const catalog = new ProviderCatalog()
    const providerCalls: string[] = []
    catalog.register({
      id: "openai",
      name: "OpenAI Stub",
      baseUrl: "https://example.test",
      defaultModel: "gpt-4o-mini",
      async generate(opts) {
        providerCalls.push(opts.prompt)
        return `provider:${opts.prompt}`
      },
    })
    expect(catalog.list().map((item) => item.id)).toContain("openai")

    const bridges = new BridgeRegistry()
    bridges.register(
      bridgeFor([
        { type: "started", at: Date.now() },
        { type: "text", content: "bridge: summarize findings" },
        { type: "completed" },
      ]),
    )

    const fallback = new FallbackStrategy({
      registry: bridges,
      catalog,
      fallbackProviderId: "openai",
    })

    const toolRegistry = new ToolRegistry()
    toolRegistry.register({
      id: "finalize_result",
      name: "Finalize Result",
      description: "Formats the bridge output into a final summary",
      risk: "low",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          root: { type: "string" },
        },
        required: ["text", "root"],
      },
      async handler(input: { text: string; root: string }) {
        return `result:${input.text}:${input.root.split("/").pop()}`
      },
    })
    const toolExecutor = new ToolExecutor({
      registry: toolRegistry,
      permission: new PermissionChecker({}),
    })

    const memory = memoryService()

    const engine = new CognitiveEngine({
      planner: new StubPlanner([
        { id: "bridge", description: "Run bridge summary" },
        {
          id: "tool",
          description: "Finalize with tool",
          dependsOn: ["bridge"],
          tool: "finalize_result",
        },
      ]),
      reasoner: new DefaultReasoner(),
      router: new ModelRouter({
        tiers: {
          executor: { providerId: "openai", model: "gpt-4o-mini" },
        },
        available: ["openai"],
      }),
      executor: {
        async execute(ctx: StepContext) {
          if (ctx.step.id === "bridge") {
            const text = await collectText(
              fallback.execute({
                taskId: "task-e2e",
                agentId: "agent-e2e",
                cli: "claude",
                cwd: report.projectRoot,
                prompt: "summarize findings",
              }),
            )
            return { output: text }
          }

          const bridgeState = ctx.priorStates.find((state) => state.id === "bridge")
          const result = await toolExecutor.invoke<string>(
            "finalize_result",
            {
              text: String(bridgeState?.output ?? ""),
              root: report.projectRoot,
            },
            { agentId: "agent-e2e", sessionId: "session-e2e" },
          )
          return { output: result.output }
        },
      },
      memory,
    })

    const run = await engine.run({
      goal: "Exercise the full lifecycle",
      expectedOutput: "Formatted result",
      sessionId: "session-e2e",
      agentId: "agent-e2e",
    })

    expect(run.completed).toBe(true)
    expect(run.reason).toBe("done")
    expect(run.states.map((state) => state.status)).toEqual(["completed", "completed"])
    expect(run.states[0]?.output).toBe("bridge: summarize findings")
    expect(run.states[1]?.output).toContain("result:bridge: summarize findings:")
    expect(providerCalls).toEqual([])

    const episodes = await memory.episodes({ taskId: "Exercise the full lifecycle" })
    expect(episodes.length).toBe(2)
  })
})
