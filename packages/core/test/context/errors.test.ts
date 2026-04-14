import { describe, expect, test } from "bun:test"
import { ContextEmptyError, ContextError, ContextQualityError } from "../../src/context/errors.ts"

describe("Context errors", () => {
  test("ContextError has stable code", () => {
    const e = new ContextError("msg", "BASE")
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe("BASE")
  })

  test("subclasses", () => {
    expect(new ContextEmptyError("no items").code).toBe("EMPTY")
    expect(new ContextQualityError("low", 0.1, 0.5).code).toBe("QUALITY")
  })

  test("ContextQualityError exposes threshold + observed", () => {
    const e = new ContextQualityError("low", 0.2, 0.5)
    expect(e.score).toBe(0.2)
    expect(e.threshold).toBe(0.5)
  })
})
