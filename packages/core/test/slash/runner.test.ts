import { describe, expect, test } from "bun:test"
import { CognitiveEngine } from "../../src/cognitive/engine.ts"
import { StubPlanner } from "../../src/cognitive/planner.ts"
import { DefaultReasoner } from "../../src/cognitive/reasoner.ts"
import { ModelRouter } from "../../src/cognitive/router.ts"
import type { StepExecutor } from "../../src/cognitive/step_executor.ts"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import { MemoryService } from "../../src/memory/service.ts"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"
import { definitionFromMarkdown, SlashRegistry } from "../../src/slash/registry.ts"
import { SlashRunner } from "../../src/slash/runner.ts"

function memoryService() {
  const embedder = new HashEmbedder({ dim: 64 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

function engine(capturedGoals: string[]): CognitiveEngine {
  const executor: StepExecutor = {
    async execute(ctx) {
      capturedGoals.push(ctx.task.goal)
      return { output: "done" }
    },
  }
  return new CognitiveEngine({
    planner: new StubPlanner([{ id: "a", description: "a" }]),
    reasoner: new DefaultReasoner(),
    router: new ModelRouter({
      tiers: { executor: { providerId: "stub" } },
      available: ["stub"],
    }),
    executor,
    memory: memoryService(),
  })
}

describe("SlashRunner", () => {
  test("executes a registered command and captures rendered prompt", async () => {
    const registry = new SlashRegistry()
    registry.register(
      definitionFromMarkdown(
        "architect",
        `---
description: Design
agents: [architect, pm, coordinator]
args:
  - name: scope
    type: string
    required: true
---
Design {{args.scope}} module.`,
      ),
    )
    const captured: string[] = []
    const runner = new SlashRunner({ registry, engine: engine(captured) })
    const result = await runner.execute("/architect auth")
    expect(result.command).toBe("architect")
    expect(result.args.scope).toBe("auth")
    expect(captured[0]).toBe("Design auth module.")
    const roleIds = result.team.members.map((m) => m.role as string).sort()
    expect(roleIds).toEqual(["architect", "coordinator", "pm"])
  })

  test("missing required arg surfaces CommandValidationError", async () => {
    const registry = new SlashRegistry()
    registry.register(
      definitionFromMarkdown(
        "x",
        `---
args:
  - name: scope
    type: string
    required: true
---
body`,
      ),
    )
    const runner = new SlashRunner({ registry, engine: engine([]) })
    await expect(runner.execute("/x")).rejects.toThrow()
  })

  test("falls back to description when body empty", async () => {
    const registry = new SlashRegistry()
    registry.register(
      definitionFromMarkdown(
        "ping",
        `---
description: ping test
---
`,
      ),
    )
    const captured: string[] = []
    const runner = new SlashRunner({ registry, engine: engine(captured) })
    await runner.execute("/ping")
    expect(captured[0]).toContain("ping test")
  })

  test("unknown command throws CommandNotFoundError", async () => {
    const registry = new SlashRegistry()
    const runner = new SlashRunner({ registry, engine: engine([]) })
    await expect(runner.execute("/nope")).rejects.toThrow(/not registered/)
  })
})
