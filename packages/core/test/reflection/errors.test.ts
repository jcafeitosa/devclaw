import { describe, expect, test } from "bun:test"
import {
  EvaluationFailedError,
  ReflectFailedError,
  ReflectionError,
} from "../../src/reflection/errors.ts"

describe("Reflection errors", () => {
  test("base code", () => {
    expect(new ReflectionError("x").code).toBe("BASE")
  })

  test("EvaluationFailedError keeps stepId + cause", () => {
    const cause = new Error("c")
    const e = new EvaluationFailedError("s1", cause)
    expect(e.stepId).toBe("s1")
    expect(e.cause).toBe(cause)
  })

  test("ReflectFailedError keeps cause", () => {
    const cause = new Error("c")
    expect(new ReflectFailedError(cause).cause).toBe(cause)
  })
})
