import { describe, expect, test } from "bun:test"
import {
  CorrectionBudgetExceededError,
  CorrectionError,
  NoHypothesisError,
} from "../../src/correction/errors.ts"

describe("Correction errors", () => {
  test("base code", () => {
    expect(new CorrectionError("x").code).toBe("BASE")
  })

  test("BudgetExceeded keeps limit/value/threshold", () => {
    const e = new CorrectionBudgetExceededError("attempts", 5, 3)
    expect(e.limit).toBe("attempts")
    expect(e.value).toBe(5)
    expect(e.threshold).toBe(3)
  })

  test("NoHypothesis code", () => {
    expect(new NoHypothesisError("runtime").code).toBe("NO_HYPOTHESIS")
  })
})
