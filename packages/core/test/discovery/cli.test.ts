import { describe, expect, test } from "bun:test"
import { detectCLIs } from "../../src/discovery/cli.ts"

describe("detectCLIs", () => {
  test("reports unavailable when which returns null", async () => {
    const result = await detectCLIs({
      names: ["claude", "codex"],
      which: async () => null,
      version: async () => "",
    })
    expect(result.claude).toEqual({ available: false })
    expect(result.codex).toEqual({ available: false })
  })

  test("reports available with path + version when both resolve", async () => {
    const result = await detectCLIs({
      names: ["claude"],
      which: async (n) => `/usr/local/bin/${n}`,
      version: async (path) => `2.1.0 (${path})`,
    })
    expect(result.claude).toEqual({
      available: true,
      path: "/usr/local/bin/claude",
      version: "2.1.0 (/usr/local/bin/claude)",
    })
  })

  test("available true but no version when --version fails gracefully", async () => {
    const result = await detectCLIs({
      names: ["aider"],
      which: async () => "/usr/local/bin/aider",
      version: async () => {
        throw new Error("spawn failed")
      },
    })
    expect(result.aider?.available).toBe(true)
    expect(result.aider?.version).toBeUndefined()
  })

  test("default names include claude/codex/gemini/aider", async () => {
    const result = await detectCLIs({
      which: async () => null,
      version: async () => "",
    })
    expect(Object.keys(result).sort()).toEqual(["aider", "claude", "codex", "gemini"])
  })
})
