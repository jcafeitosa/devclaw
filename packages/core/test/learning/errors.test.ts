import { describe, expect, test } from "bun:test"
import {
  CapsuleImportError,
  CapsuleNotFoundError,
  InvalidCapsuleError,
  LearningError,
  NotReadyForPromotionError,
} from "../../src/learning/errors.ts"

describe("Learning errors", () => {
  test("base code", () => {
    expect(new LearningError("x").code).toBe("BASE")
  })

  test("CapsuleNotFound keeps id", () => {
    expect(new CapsuleNotFoundError("c").id).toBe("c")
  })

  test("InvalidCapsule keeps issues", () => {
    expect(new InvalidCapsuleError(["no triplet"]).issues).toEqual(["no triplet"])
  })

  test("NotReadyForPromotion keeps reasons", () => {
    const e = new NotReadyForPromotionError("c", ["low score", "few applications"])
    expect(e.id).toBe("c")
    expect(e.reasons).toHaveLength(2)
  })

  test("CapsuleImport wraps cause", () => {
    const cause = new Error("bad")
    expect(new CapsuleImportError(cause).cause).toBe(cause)
  })
})
