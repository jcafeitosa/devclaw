import { describe, expect, test } from "bun:test"
import type { RunResult } from "../../src/cognitive/types.ts"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import { MemoryService } from "../../src/memory/service.ts"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"
import { RubricEvaluator } from "../../src/reflection/evaluator.ts"
import { ReflectionPipeline } from "../../src/reflection/pipeline.ts"
import { DefaultReflector } from "../../src/reflection/reflector.ts"

function svc() {
  const embedder = new HashEmbedder({ dim: 64 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

describe("ReflectionPipeline", () => {
  test("evaluate → reflect → persist lessons end-to-end", async () => {
    const memory = svc()
    const pipeline = new ReflectionPipeline({
      evaluator: new RubricEvaluator({ criteria: [] }),
      reflector: new DefaultReflector(),
      memory,
    })
    const run: RunResult = {
      plan: {
        goal: "t1",
        createdAt: 0,
        steps: [
          { id: "a", description: "ok" },
          { id: "b", description: "bad" },
        ],
      },
      states: [
        { id: "a", status: "completed" },
        { id: "b", status: "failed", error: "connection refused" },
      ],
      episodes: [],
      completed: false,
      reason: "step_failed",
    }
    const { reflection, persistedLessonIds } = await pipeline.run(run)
    expect(reflection.outcome).toBe("failed")
    expect(reflection.corrections.length).toBeGreaterThan(0)
    expect(persistedLessonIds.length).toBe(reflection.lessons.length)
    const hits = await memory.recall({ text: "connection refused" })
    expect(hits.some((h) => h.item.content.includes("connection refused"))).toBe(true)
  })

  test("evaluation errors are captured, pipeline still completes", async () => {
    const memory = svc()
    const pipeline = new ReflectionPipeline({
      evaluator: {
        async evaluate(step) {
          if (step.id === "bad") throw new Error("evaluator boom")
          return { stepId: step.id, score: 1, passed: true, criteria: [] }
        },
      },
      reflector: new DefaultReflector(),
      memory,
    })
    const run: RunResult = {
      plan: {
        goal: "t",
        createdAt: 0,
        steps: [
          { id: "ok", description: "ok" },
          { id: "bad", description: "bad" },
        ],
      },
      states: [
        { id: "ok", status: "completed" },
        { id: "bad", status: "completed" },
      ],
      episodes: [],
      completed: true,
      reason: "done",
    }
    const { reflection, evaluationErrors } = await pipeline.run(run)
    expect(evaluationErrors.length).toBe(1)
    expect(reflection.evaluations.length).toBe(1)
  })
})
