import { describe, expect, test } from "bun:test"
import { builtinDefinitions, registerBuiltinCommands } from "../../src/slash/builtins.ts"
import { SlashRegistry } from "../../src/slash/registry.ts"

describe("built-in slash commands", () => {
  test("5 built-ins: architect, consensus, tdd, code-review, security-review", () => {
    const defs = builtinDefinitions()
    expect(defs.map((d) => d.name).sort()).toEqual([
      "architect",
      "code-review",
      "consensus",
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
    ).toEqual(["architect", "code-review", "consensus", "security-review", "tdd"])
  })

  test("builtin architect requires scope arg", () => {
    const arch = builtinDefinitions().find((d) => d.name === "architect")
    expect(arch?.args?.find((a) => a.name === "scope")?.required).toBe(true)
  })

  test("builtin consensus requires prompt arg", () => {
    const consensus = builtinDefinitions().find((d) => d.name === "consensus")
    expect(consensus?.args?.find((a) => a.name === "prompt")?.required).toBe(true)
  })
})
