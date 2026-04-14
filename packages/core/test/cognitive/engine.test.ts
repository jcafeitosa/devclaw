import { describe, expect, test } from "bun:test"
import { CognitiveEngine } from "../../src/cognitive/engine.ts"
import { MaxStepsExceededError, StepFailedError } from "../../src/cognitive/errors.ts"
import { StubPlanner } from "../../src/cognitive/planner.ts"
import { DefaultReasoner } from "../../src/cognitive/reasoner.ts"
import { ModelRouter } from "../../src/cognitive/router.ts"
import type { StepExecutor } from "../../src/cognitive/step_executor.ts"
import type { Step, StepContext } from "../../src/cognitive/types.ts"
import { MemoryAuditSink } from "../../src/audit/sink.ts"
import { SafetyKernel } from "../../src/kernel/index.ts"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import { MemoryService } from "../../src/memory/service.ts"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"
import { PermissionEvaluator } from "../../src/permission/evaluator.ts"
import { RegexPatternModerator } from "../../src/safety/moderator.ts"
import { createDefaultModerator } from "../../src/safety/moderator.ts"
import type { Moderator } from "../../src/safety/types.ts"

function memoryService() {
  const embedder = new HashEmbedder({ dim: 64 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

function makeEngine(
  steps: Step[],
  exec: (ctx: StepContext) => Promise<{ output: unknown } | { error: string }>,
  memory = memoryService(),
  maxSteps = 10,
  moderator?: Moderator,
) {
  const executor: StepExecutor = {
    async execute(ctx) {
      const r = await exec(ctx)
      if ("error" in r) throw new Error(r.error)
      return { output: r.output }
    },
  }
  return {
    engine: new CognitiveEngine({
      planner: new StubPlanner(steps),
      reasoner: new DefaultReasoner(),
      router: new ModelRouter({
        tiers: { executor: { providerId: "openai" } },
        available: ["openai"],
      }),
      executor,
      memory,
      moderator,
      maxSteps,
    }),
    memory,
  }
}

describe("CognitiveEngine", () => {
  test("runs all steps then completes with reason=done", async () => {
    const outputs: string[] = []
    const { engine, memory } = makeEngine(
      [
        { id: "a", description: "do a", priority: 2 },
        { id: "b", description: "do b", priority: 1, dependsOn: ["a"] },
      ],
      async (ctx) => {
        outputs.push(ctx.step.id)
        return { output: `done:${ctx.step.id}` }
      },
    )
    const result = await engine.run({ goal: "g", expectedOutput: "x", sessionId: "s" })
    expect(result.completed).toBe(true)
    expect(result.reason).toBe("done")
    expect(outputs).toEqual(["a", "b"])
    expect(result.states.every((s) => s.status === "completed")).toBe(true)
    const eps = await memory.episodes({ taskId: result.plan.goal })
    expect(eps.length).toBe(2)
  })

  test("throws StepFailedError when executor throws", async () => {
    const { engine } = makeEngine([{ id: "a", description: "x" }], async () => {
      throw new Error("boom")
    })
    await expect(engine.run({ goal: "g", expectedOutput: "x" })).rejects.toBeInstanceOf(
      StepFailedError,
    )
  })

  test("throws MaxStepsExceededError when plan too big", async () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      description: `step ${i}`,
    }))
    const { engine } = makeEngine(
      steps,
      async (ctx) => ({ output: ctx.step.id }),
      memoryService(),
      3,
    )
    await expect(engine.run({ goal: "g", expectedOutput: "x" })).rejects.toBeInstanceOf(
      MaxStepsExceededError,
    )
  })

  test("uses step.tier to route, defaulting to executor", async () => {
    const seenTiers: string[] = []
    const memory = memoryService()
    const executor: StepExecutor = {
      async execute(ctx) {
        seenTiers.push(ctx.route.tier)
        return { output: ctx.step.id }
      },
    }
    const engine = new CognitiveEngine({
      planner: new StubPlanner([
        { id: "a", description: "a" },
        { id: "b", description: "b", tier: "advisor" },
      ]),
      reasoner: new DefaultReasoner(),
      router: new ModelRouter({
        tiers: {
          executor: { providerId: "openai" },
          advisor: { providerId: "anthropic" },
        },
        available: ["openai", "anthropic"],
      }),
      executor,
      memory,
    })
    await engine.run({ goal: "g", expectedOutput: "x" })
    expect(seenTiers).toContain("executor")
    expect(seenTiers).toContain("advisor")
  })

  test("blocks step when output moderation flags content", async () => {
    const { engine } = makeEngine(
      [{ id: "a", description: "unsafe" }],
      async () => ({ output: "contains LEAK marker" }),
      memoryService(),
      10,
      new RegexPatternModerator([
        {
          name: "warn_marker",
          category: "dangerous_instructions",
          pattern: /LEAK/g,
          severity: "warn",
          modes: ["output"],
        },
      ]),
    )
    await expect(engine.run({ goal: "g", expectedOutput: "x" })).rejects.toBeInstanceOf(
      StepFailedError,
    )
    await expect(engine.run({ goal: "g", expectedOutput: "x" })).rejects.toThrow(
      /safety blocked output/i,
    )
  })

  test("routes step execution through kernel when configured", async () => {
    const memory = memoryService()
    const executor: StepExecutor = {
      async execute() {
        return { output: "safe output" }
      },
    }
    const engine = new CognitiveEngine({
      planner: new StubPlanner([{ id: "a", description: "a" }]),
      reasoner: new DefaultReasoner(),
      router: new ModelRouter({
        tiers: { executor: { providerId: "openai" } },
        available: ["openai"],
      }),
      executor,
      memory,
      kernel: new SafetyKernel({
        permission: new PermissionEvaluator({
          rules: [{ tool: "openai", action: "cognitive.step", decision: "deny", reason: "blocked" }],
          defaultDecision: "allow",
        }),
        safety: createDefaultModerator(),
        audit: new MemoryAuditSink(),
      }),
    })
    await expect(engine.run({ goal: "g", expectedOutput: "x" })).rejects.toBeInstanceOf(
      StepFailedError,
    )
    await expect(engine.run({ goal: "g", expectedOutput: "x" })).rejects.toThrow(
      /permission denied/i,
    )
  })
})
