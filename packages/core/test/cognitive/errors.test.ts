import { describe, expect, test } from "bun:test"
import {
  CognitiveError,
  MaxStepsExceededError,
  NoRouteError,
  PlanCycleError,
  PlanParseError,
  StepFailedError,
} from "../../src/cognitive/errors.ts"

describe("Cognitive errors", () => {
  test("base code", () => {
    expect(new CognitiveError("x").code).toBe("BASE")
  })

  test("PlanParseError keeps cause", () => {
    const cause = new SyntaxError("bad")
    expect(new PlanParseError("raw", cause).cause).toBe(cause)
  })

  test("PlanCycleError keeps cycle array", () => {
    expect(new PlanCycleError(["a", "b", "a"]).cycle).toEqual(["a", "b", "a"])
  })

  test("NoRouteError keeps tier", () => {
    expect(new NoRouteError("advisor").tier).toBe("advisor")
  })

  test("StepFailedError keeps stepId + cause", () => {
    const c = new Error("c")
    const e = new StepFailedError("s1", c)
    expect(e.stepId).toBe("s1")
    expect(e.cause).toBe(c)
  })

  test("MaxStepsExceededError keeps max", () => {
    expect(new MaxStepsExceededError(20).max).toBe(20)
  })
})
