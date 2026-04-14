import { describe, expect, test } from "bun:test"
import { builtinDefinitions, registerBuiltinCommands } from "../../src/slash/builtins.ts"
import { SlashRegistry } from "../../src/slash/registry.ts"

describe("built-in slash commands", () => {
  test("4 built-ins: architect, tdd, code-review, security-review", () => {
    const defs = builtinDefinitions()
    expect(defs.map((d) => d.name).sort()).toEqual([
      "architect",
      "code-review",
      "security-review",
      "tdd",
    ])
  })

  test("each builtin has agents + body", () => {
    for (const def of builtinDefinitions()) {
      expect(def.agents?.length ?? 0).toBeGreaterThan(0)
      expect(def.body.length).toBeGreaterThan(20)
    }
  })

  test("registerBuiltinCommands populates registry", () => {
    const r = new SlashRegistry()
    registerBuiltinCommands(r)
    expect(
      r
        .list()
        .map((d) => d.name)
        .sort(),
    ).toEqual(["architect", "code-review", "security-review", "tdd"])
  })

  test("builtin architect requires scope arg", () => {
    const arch = builtinDefinitions().find((d) => d.name === "architect")
    expect(arch?.args?.find((a) => a.name === "scope")?.required).toBe(true)
  })
})
