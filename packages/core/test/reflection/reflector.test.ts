import { describe, expect, test } from "bun:test"
import type { Plan, RunResult, StepState } from "../../src/cognitive/types.ts"
import { DefaultReflector } from "../../src/reflection/reflector.ts"
import type { Evaluation } from "../../src/reflection/types.ts"

function makePlan(): Plan {
  return {
    goal: "migrate db",
    createdAt: 0,
    steps: [
      { id: "a", description: "dump" },
      { id: "b", description: "apply", dependsOn: ["a"] },
    ],
  }
}

function state(id: string, status: StepState["status"], error?: string): StepState {
  return { id, status, error }
}

function evalOf(stepId: string, score: number, passed: boolean): Evaluation {
  return { stepId, score, passed, criteria: [] }
}

describe("DefaultReflector", () => {
  const reflector = new DefaultReflector()

  test("all-ok: no corrections + at least one lesson from success", async () => {
    const run: RunResult = {
      plan: makePlan(),
      states: [state("a", "completed"), state("b", "completed")],
      episodes: [],
      completed: true,
      reason: "done",
    }
    const refl = await reflector.reflect({
      runResult: run,
      evaluations: [evalOf("a", 1, true), evalOf("b", 1, true)],
    })
    expect(refl.outcome).toBe("all_ok")
    expect(refl.corrections).toEqual([])
    expect(refl.lessons.length).toBeGreaterThan(0)
  })

  test("single failure → retry proposal + lesson", async () => {
    const run: RunResult = {
      plan: makePlan(),
      states: [state("a", "completed"), state("b", "failed", "db conn refused")],
      episodes: [],
      completed: false,
      reason: "step_failed",
    }
    const refl = await reflector.reflect({
      runResult: run,
      evaluations: [evalOf("a", 1, true), evalOf("b", 0, false)],
    })
    expect(refl.outcome).toBe("failed")
    const retry = refl.corrections.find((c) => c.stepId === "b")
    expect(retry?.action).toBe("retry")
    expect(refl.lessons.some((l) => l.content.includes("db conn refused"))).toBe(true)
  })

  test("low-score but passed step → degraded outcome with replace proposal", async () => {
    const run: RunResult = {
      plan: makePlan(),
      states: [state("a", "completed"), state("b", "completed")],
      episodes: [],
      completed: true,
      reason: "done",
    }
    const refl = await reflector.reflect({
      runResult: run,
      evaluations: [evalOf("a", 1, true), evalOf("b", 0.55, true)],
    })
    expect(refl.outcome).toBe("degraded")
    expect(refl.corrections.some((c) => c.stepId === "b" && c.action === "replace")).toBe(true)
  })

  test("partial outcome when some steps incomplete without explicit failure", async () => {
    const run: RunResult = {
      plan: makePlan(),
      states: [state("a", "completed"), state("b", "pending")],
      episodes: [],
      completed: false,
      reason: "max_steps",
    }
    const refl = await reflector.reflect({
      runResult: run,
      evaluations: [evalOf("a", 1, true)],
    })
    expect(refl.outcome).toBe("partial")
  })
})
