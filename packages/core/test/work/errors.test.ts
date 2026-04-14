import { describe, expect, test } from "bun:test"
import {
  InvalidDependencyError,
  InvalidParentError,
  WorkCycleError,
  WorkError,
  WorkNotFoundError,
} from "../../src/work/errors.ts"

describe("Work errors", () => {
  test("base code", () => {
    expect(new WorkError("x").code).toBe("BASE")
  })

  test("NotFound id", () => {
    expect(new WorkNotFoundError("i").id).toBe("i")
  })

  test("CycleError keeps cycle path", () => {
    expect(new WorkCycleError(["a", "b", "a"]).cycle).toEqual(["a", "b", "a"])
  })

  test("InvalidParent keeps ids", () => {
    const e = new InvalidParentError("c", "p", "kind mismatch")
    expect(e.childId).toBe("c")
    expect(e.parentId).toBe("p")
  })

  test("InvalidDependency keeps endpoints", () => {
    const e = new InvalidDependencyError("a", "b", "self-loop")
    expect(e.fromId).toBe("a")
    expect(e.toId).toBe("b")
  })
})
