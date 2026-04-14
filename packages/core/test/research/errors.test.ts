import { describe, expect, test } from "bun:test"
import {
  NoResultsError,
  ResearchBudgetExceededError,
  ResearchError,
  SourceFailedError,
} from "../../src/research/errors.ts"

describe("Research errors", () => {
  test("base code", () => {
    expect(new ResearchError("x").code).toBe("BASE")
  })

  test("SourceFailed wraps cause", () => {
    const cause = new Error("net")
    const e = new SourceFailedError("src-1", cause)
    expect(e.sourceId).toBe("src-1")
    expect(e.cause).toBe(cause)
  })

  test("BudgetExceeded keeps limit/used", () => {
    const e = new ResearchBudgetExceededError(5, 6)
    expect(e.limit).toBe(5)
    expect(e.used).toBe(6)
  })

  test("NoResults keeps query", () => {
    expect(new NoResultsError("postgres").query).toBe("postgres")
  })
})
