import { describe, expect, test } from "bun:test"

import { BridgeRegistry } from "../../src/bridge/registry.ts"
import type {
  Bridge,
  BridgeEvent,
  BridgeRequest,
  Capabilities,
  CliId,
} from "../../src/bridge/types.ts"
import {
  ConsensusNoBridgesError,
  type ConsensusResult,
  runConsensus,
} from "../../src/consensus/index.ts"

function bridgeStub(
  cli: CliId,
  events: BridgeEvent[],
  opts: { available?: boolean; authed?: boolean; throws?: boolean } = {},
): Bridge {
  return {
    cli,
    async isAvailable() {
      return opts.available ?? true
    },
    async isAuthenticated() {
      return { authed: opts.authed ?? true }
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
      return { costUsd: 0, tokensIn: 10, tokensOut: 10, subscriptionCovered: true }
    },
    execute(): AsyncIterable<BridgeEvent> {
      if (opts.throws) {
        return (async function* () {
          throw new Error(`${cli}:kaboom`)
        })()
      }
      return (async function* () {
        for (const ev of events) yield ev
      })()
    },
    async cancel() {},
  }
}

const req: BridgeRequest = {
  taskId: "task-c",
  agentId: "agent-c",
  cli: "claude",
  cwd: "/tmp",
  prompt: "summarize",
}

describe("runConsensus — happy path", () => {
  test("fans out to all registered available bridges in parallel", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("claude", [{ type: "text", content: "claude output" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("codex", [{ type: "text", content: "codex output" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("gemini", [{ type: "text", content: "gemini output" }, { type: "completed" }]),
    )

    const result = await runConsensus(
      { bridges: registry, scorer: async (_cli, text) => text.length },
      req,
    )
    expect(result.participants.map((p) => p.cli).sort()).toEqual(["claude", "codex", "gemini"])
    for (const p of result.participants) {
      expect(p.text).toContain("output")
      expect(p.error).toBeUndefined()
    }
  })

  test("winner is highest-scoring participant", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("claude", [{ type: "text", content: "short" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("codex", [
        { type: "text", content: "a significantly longer response" },
        { type: "completed" },
      ]),
    )
    registry.register(
      bridgeStub("gemini", [{ type: "text", content: "medium len" }, { type: "completed" }]),
    )

    const result = await runConsensus(
      { bridges: registry, scorer: async (_cli, text) => text.length },
      req,
    )
    expect(result.winner).toBe("codex")
    expect(result.winnerText).toBe("a significantly longer response")
  })

  test("tie broken alphabetically by cli name", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("gemini", [{ type: "text", content: "same" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("claude", [{ type: "text", content: "same" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("codex", [{ type: "text", content: "same" }, { type: "completed" }]),
    )

    const result = await runConsensus(
      { bridges: registry, scorer: async () => 0.5 },
      req,
    )
    expect(result.winner).toBe("claude")
  })
})

describe("runConsensus — filter clis", () => {
  test("respects opts.clis subset", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("claude", [{ type: "text", content: "claude" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("codex", [{ type: "text", content: "codex" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("gemini", [{ type: "text", content: "gemini" }, { type: "completed" }]),
    )

    const result = await runConsensus(
      {
        bridges: registry,
        scorer: async (_cli, text) => text.length,
        clis: ["codex", "gemini"],
      },
      req,
    )
    expect(result.participants.map((p) => p.cli).sort()).toEqual(["codex", "gemini"])
  })
})

describe("runConsensus — unavailable + failed", () => {
  test("skips unavailable bridges (not authed / not available)", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("claude", [{ type: "text", content: "on" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("codex", [{ type: "text", content: "should-skip" }, { type: "completed" }], {
        available: false,
      }),
    )
    registry.register(
      bridgeStub("gemini", [{ type: "text", content: "also-skip" }, { type: "completed" }], {
        authed: false,
      }),
    )

    const result = await runConsensus(
      { bridges: registry, scorer: async () => 1 },
      req,
    )
    expect(result.participants.map((p) => p.cli)).toEqual(["claude"])
    expect(result.winner).toBe("claude")
  })

  test("bridge that throws becomes participant with error + score 0", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("claude", [{ type: "text", content: "fine" }, { type: "completed" }]),
    )
    registry.register(
      bridgeStub("codex", [], { throws: true }),
    )

    const result: ConsensusResult = await runConsensus(
      { bridges: registry, scorer: async (_cli, text) => text.length || 0 },
      req,
    )
    const codex = result.participants.find((p) => p.cli === "codex")
    expect(codex?.error?.message).toContain("kaboom")
    expect(result.scores.find((s) => s.cli === "codex")?.score).toBe(0)
    expect(result.winner).toBe("claude")
  })

  test("throws ConsensusNoBridgesError when nothing eligible", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("claude", [], { available: false }),
    )
    await expect(
      runConsensus({ bridges: registry, scorer: async () => 1 }, req),
    ).rejects.toBeInstanceOf(ConsensusNoBridgesError)
  })
})

describe("runConsensus — scorer is called with (cli, text)", () => {
  test("scorer receives cli name and final collected text", async () => {
    const registry = new BridgeRegistry()
    registry.register(
      bridgeStub("claude", [
        { type: "text", content: "part 1 " },
        { type: "text", content: "part 2" },
        { type: "completed" },
      ]),
    )
    const seen: Array<{ cli: string; text: string }> = []
    await runConsensus(
      {
        bridges: registry,
        scorer: async (cli, text) => {
          seen.push({ cli, text })
          return 1
        },
      },
      req,
    )
    expect(seen).toEqual([{ cli: "claude", text: "part 1 part 2" }])
  })
})
