import { describe, expect, test } from "bun:test"
import { createColorizer } from "../src/color.ts"
import { formatCommandHelp, formatGlobalHelp } from "../src/help.ts"
import { CommandRegistry } from "../src/registry.ts"

describe("createColorizer", () => {
  test("disabled: passes text through unchanged", () => {
    const c = createColorizer(false)
    expect(c("red", "hi")).toBe("hi")
    expect(c.bold("hi")).toBe("hi")
  })

  test("enabled: wraps text with ANSI codes", () => {
    const c = createColorizer(true)
    expect(c("red", "hi")).toContain("\x1b[31m")
    expect(c("red", "hi")).toContain("\x1b[0m")
  })
})

describe("formatGlobalHelp", () => {
  test("lists commands alphabetically", () => {
    const reg = new CommandRegistry()
    reg.register({ name: "zeta", describe: "last", handler: async () => 0 })
    reg.register({ name: "alpha", describe: "first", handler: async () => 0 })
    const out = formatGlobalHelp(
      { binName: "devclaw", colorizer: createColorizer(false) },
      reg.list(),
    )
    const alphaIdx = out.indexOf("alpha")
    const zetaIdx = out.indexOf("zeta")
    expect(alphaIdx).toBeGreaterThan(0)
    expect(alphaIdx).toBeLessThan(zetaIdx)
  })
})

describe("formatCommandHelp", () => {
  test("renders name + describe + flags", () => {
    const out = formatCommandHelp(
      { binName: "devclaw", colorizer: createColorizer(false) },
      {
        name: "invoke",
        describe: "Run a prompt",
        usage: 'devclaw invoke --prompt "hi"',
        flags: [{ name: "prompt", describe: "Prompt text", required: true }],
        handler: async () => 0,
      },
    )
    expect(out).toContain("devclaw invoke")
    expect(out).toContain("Run a prompt")
    expect(out).toContain("--prompt")
  })
})
