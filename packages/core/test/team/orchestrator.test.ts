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
import { TeamAssembler } from "../../src/team/assembler.ts"
import { TeamOrchestrator } from "../../src/team/orchestrator.ts"

function memoryService() {
  const embedder = new HashEmbedder({ dim: 64 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

describe("TeamOrchestrator", () => {
  test("runs end-to-end with assembled team + engine + pattern", async () => {
    const team = new TeamAssembler().assemble({
      id: "p",
      name: "e2e",
      techStack: ["bun", "astro"],
      isReleaseTarget: true,
    })
    const executor: StepExecutor = {
      async execute() {
        return { output: "ok" }
      },
    }
    const engine = new CognitiveEngine({
      planner: new StubPlanner([{ id: "a", description: "a" }]),
      reasoner: new DefaultReasoner(),
      router: new ModelRouter({
        tiers: { executor: { providerId: "stub" } },
        available: ["stub"],
      }),
      executor,
      memory: memoryService(),
    })
    const orch = new TeamOrchestrator({ team, engine })
    const out = await orch.run({
      task: { goal: "implement login", expectedOutput: "done" },
      pattern: "generator-verifier",
    })
    expect(out.run.completed).toBe(true)
    expect(out.pattern.pattern).toBe("generator-verifier")
    expect(out.team.members.map((m) => m.role)).toContain("backend")
    expect(out.team.members.map((m) => m.role)).toContain("frontend")
    expect(out.team.members.map((m) => m.role)).toContain("qa")
  })
})
