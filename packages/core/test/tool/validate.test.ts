import { describe, expect, test } from "bun:test"
import type { ToolSchema } from "../../src/tool/types.ts"
import { validateInput } from "../../src/tool/validate.ts"

const s: ToolSchema = {
  type: "object",
  properties: {
    path: { type: "string" },
    mode: { type: "string", enum: ["r", "w"] },
    count: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
    meta: {
      type: "object",
      properties: { verbose: { type: "boolean" } },
    },
  },
  required: ["path"],
}

describe("validateInput", () => {
  test("valid minimal input passes", () => {
    const r = validateInput(s, { path: "/a" })
    expect(r.ok).toBe(true)
  })

  test("missing required field reports issue", () => {
    const r = validateInput(s, {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.includes("path"))).toBe(true)
  })

  test("wrong type reports issue", () => {
    const r = validateInput(s, { path: 42 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.includes("path"))).toBe(true)
  })

  test("enum rejects values outside the set", () => {
    const r = validateInput(s, { path: "a", mode: "x" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.includes("mode"))).toBe(true)
  })

  test("array items validated", () => {
    const r = validateInput(s, { path: "a", tags: ["ok", 2] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.includes("tags"))).toBe(true)
  })

  test("nested object validated", () => {
    const r = validateInput(s, { path: "a", meta: { verbose: "yes" } })
    expect(r.ok).toBe(false)
  })

  test("extra fields ignored (open schema)", () => {
    const r = validateInput(s, { path: "a", extra: 1 })
    expect(r.ok).toBe(true)
  })

  test("non-object input rejected", () => {
    const r = validateInput(s, "nope")
    expect(r.ok).toBe(false)
  })
})
