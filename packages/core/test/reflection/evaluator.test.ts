import { describe, expect, test } from "bun:test"
import type { Step, StepState } from "../../src/cognitive/types.ts"
import type { ProviderCatalog } from "../../src/provider/catalog.ts"
import { EvaluationFailedError } from "../../src/reflection/errors.ts"
import { RubricEvaluator } from "../../src/reflection/evaluator.ts"
import type { EvaluationCriterion } from "../../src/reflection/types.ts"

function step(id: string): Step {
  return { id, description: id }
}

function state(id: string, status: StepState["status"] = "completed", output?: unknown): StepState {
  return { id, status, output }
}

describe("RubricEvaluator", () => {
  test("empty rubric → score 1, passed true", async () => {
    const e = new RubricEvaluator({ criteria: [] })
    const result = await e.evaluate(step("a"), state("a"))
    expect(result.score).toBe(1)
    expect(result.passed).toBe(true)
  })

  test("programmatic criterion runs its check", async () => {
    const crit: EvaluationCriterion = {
      id: "non-empty",
      description: "output is non-empty",
      kind: "programmatic",
      check: async (_s, st) => (typeof st.output === "string" && st.output.length > 0 ? 1 : 0),
    }
    const e = new RubricEvaluator({ criteria: [crit] })
    expect((await e.evaluate(step("a"), state("a", "completed", "hi"))).score).toBe(1)
    expect((await e.evaluate(step("a"), state("a", "completed", ""))).score).toBe(0)
  })

  test("weighted average across criteria", async () => {
    const e = new RubricEvaluator({
      criteria: [
        { id: "a", description: "", kind: "programmatic", weight: 3, check: async () => 1 },
        { id: "b", description: "", kind: "programmatic", weight: 1, check: async () => 0 },
      ],
    })
    const r = await e.evaluate(step("a"), state("a"))
    expect(r.score).toBeCloseTo(0.75, 5)
  })

  test("threshold controls passed flag", async () => {
    const e = new RubricEvaluator({
      threshold: 0.9,
      criteria: [{ id: "a", description: "", kind: "programmatic", check: async () => 0.85 }],
    })
    const r = await e.evaluate(step("a"), state("a"))
    expect(r.passed).toBe(false)
    expect(r.score).toBeCloseTo(0.85, 5)
  })

  test("failed step shortcuts to score 0", async () => {
    const e = new RubricEvaluator({
      criteria: [{ id: "a", description: "", kind: "programmatic", check: async () => 1 }],
    })
    const r = await e.evaluate(step("a"), state("a", "failed"))
    expect(r.score).toBe(0)
    expect(r.passed).toBe(false)
  })

  test("programmatic check throwing wraps in EvaluationFailedError", async () => {
    const e = new RubricEvaluator({
      criteria: [
        {
          id: "a",
          description: "",
          kind: "programmatic",
          check: async () => {
            throw new Error("boom")
          },
        },
      ],
    })
    await expect(e.evaluate(step("a"), state("a"))).rejects.toBeInstanceOf(EvaluationFailedError)
  })

  test("llm criterion uses provider catalog", async () => {
    const catalog = {
      async generate(_id: string, opts: { prompt: string }) {
        return opts.prompt.includes("great") ? "1.0" : "0.2"
      },
    }
    const e = new RubricEvaluator({
      catalog: catalog as unknown as ProviderCatalog,
      providerId: "anthropic",
      criteria: [
        {
          id: "quality",
          description: "",
          kind: "llm",
          prompt: "Output is great",
        },
      ],
    })
    const r = await e.evaluate(step("a"), state("a", "completed", "great answer"))
    expect(r.score).toBeCloseTo(1, 5)
  })
})
