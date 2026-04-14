import { describe, expect, test } from "bun:test"
import {
  SkillError,
  SkillNotFoundError,
  SkillParseError,
  SkillTransitionError,
} from "../../src/skill/errors.ts"

describe("Skill errors", () => {
  test("base code", () => {
    expect(new SkillError("x").code).toBe("BASE")
  })

  test("NotFound keeps id/version", () => {
    const e = new SkillNotFoundError("x", "1.0.0")
    expect(e.id).toBe("x")
    expect(e.version).toBe("1.0.0")
  })

  test("TransitionError keeps from/to", () => {
    const e = new SkillTransitionError("draft", "archived")
    expect(e.from).toBe("draft")
    expect(e.to).toBe("archived")
  })

  test("ParseError wraps cause", () => {
    const cause = new Error("bad")
    expect(new SkillParseError("x", cause).cause).toBe(cause)
  })
})
