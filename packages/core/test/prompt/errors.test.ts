import { describe, expect, test } from "bun:test"
import {
  MissingVariableError,
  PromptError,
  RenderError,
  TemplateNotFoundError,
} from "../../src/prompt/errors.ts"

describe("Prompt errors", () => {
  test("PromptError base stable code", () => {
    const e = new PromptError("m")
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe("BASE")
  })

  test("TemplateNotFoundError keeps id+version", () => {
    const e = new TemplateNotFoundError("x", "1.0.0")
    expect(e.code).toBe("TEMPLATE_NOT_FOUND")
    expect(e.templateId).toBe("x")
    expect(e.version).toBe("1.0.0")
  })

  test("MissingVariableError keeps variable name", () => {
    const e = new MissingVariableError("goal")
    expect(e.code).toBe("MISSING_VAR")
    expect(e.variable).toBe("goal")
  })

  test("RenderError wraps cause", () => {
    const cause = new Error("x")
    const e = new RenderError("boom", cause)
    expect(e.code).toBe("RENDER")
    expect(e.cause).toBe(cause)
  })
})
