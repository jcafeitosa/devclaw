import { describe, expect, test } from "bun:test"
import { CorrectionBudget } from "../../src/correction/budget.ts"
import { CorrectionBudgetExceededError } from "../../src/correction/errors.ts"

describe("CorrectionBudget", () => {
  test("defaults allow 3 attempts", () => {
    const b = new CorrectionBudget()
    b.startAttempt()
    b.startAttempt()
    b.startAttempt()
    expect(() => b.startAttempt()).toThrow(CorrectionBudgetExceededError)
  })

  test("cost multiplier derives max from originalCost", () => {
    const b = new CorrectionBudget({ originalCostUsd: 0.1, costMultiplier: 5 })
    expect(b.maxCostUsd).toBeCloseTo(0.5, 5)
  })

  test("record accumulates cost/tokens", () => {
    const b = new CorrectionBudget({ maxCostUsd: 1 })
    b.startAttempt()
    b.record({ costUsd: 0.3, tokens: 100 })
    b.record({ costUsd: 0.4, tokens: 150 })
    const s = b.snapshot()
    expect(s.costUsd).toBeCloseTo(0.7, 5)
    expect(s.tokens).toBe(250)
  })

  test("cost over threshold rejects next attempt", () => {
    const b = new CorrectionBudget({ maxCostUsd: 0.5 })
    b.startAttempt()
    b.record({ costUsd: 0.8 })
    expect(() => b.startAttempt()).toThrow(CorrectionBudgetExceededError)
  })

  test("canAttempt reflects current state", () => {
    const b = new CorrectionBudget({ maxAttempts: 1 })
    expect(b.canAttempt()).toBe(true)
    b.startAttempt()
    expect(b.canAttempt()).toBe(false)
  })
})
