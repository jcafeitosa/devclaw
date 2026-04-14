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

function memory() {
  const embedder = new HashEmbedder({ dim: 64 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

describe("CognitiveEngine hooks", () => {
  const executor: StepExecutor = {
    async execute(ctx) {
      if (ctx.step.id === "bad") throw new Error("boom")
      return { output: `ok:${ctx.step.id}` }
    },
  }

  test("onStepCompleted fires per successful step", async () => {
    const completed: string[] = []
    const engine = new CognitiveEngine({
      planner: new StubPlanner([
        { id: "a", description: "a" },
        { id: "b", description: "b" },
      ]),
      reasoner: new DefaultReasoner(),
      router: new ModelRouter({
        tiers: { executor: { providerId: "openai" } },
        available: ["openai"],
      }),
      executor,
      memory: memory(),
      onStepCompleted: async (_ctx, state) => {
        completed.push(state.id)
      },
    })
    await engine.run({ goal: "g", expectedOutput: "x" })
    expect(completed).toEqual(["a", "b"])
  })

  test("onStepFailed fires before error propagation", async () => {
    const failed: string[] = []
    const engine = new CognitiveEngine({
      planner: new StubPlanner([{ id: "bad", description: "bad" }]),
      reasoner: new DefaultReasoner(),
      router: new ModelRouter({
        tiers: { executor: { providerId: "openai" } },
        available: ["openai"],
      }),
      executor,
      memory: memory(),
      onStepFailed: async (_ctx, state) => {
        failed.push(state.id)
      },
    })
    await expect(engine.run({ goal: "g", expectedOutput: "x" })).rejects.toThrow()
    expect(failed).toEqual(["bad"])
  })
})
