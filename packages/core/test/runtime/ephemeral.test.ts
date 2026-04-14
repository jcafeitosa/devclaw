import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { EphemeralRuntime } from "../../src/runtime/ephemeral.ts"

describe("EphemeralRuntime", () => {
  test("creates a fresh dir per run and cleans up after", async () => {
    const rt = new EphemeralRuntime()
    let observed = ""
    const r = await rt.run({
      command: ["sh", "-c", "pwd"],
      onCwd: (p) => {
        observed = p
      },
    })
    expect(r.stdout.trim()).toBe(observed)
    expect(observed).toMatch(/devclaw-rt-/)
    expect(existsSync(observed)).toBe(false)
  })

  test("explicit cwd in spec is ignored — runtime always provisions one", async () => {
    const rt = new EphemeralRuntime()
    let observed = ""
    await rt.run({
      command: ["pwd"],
      cwd: "/should-be-ignored",
      onCwd: (p) => {
        observed = p
      },
    })
    expect(observed).not.toBe("/should-be-ignored")
  })

  test("cleans up even when command fails", async () => {
    const rt = new EphemeralRuntime()
    let observed = ""
    const r = await rt.run({
      command: ["sh", "-c", "exit 9"],
      onCwd: (p) => {
        observed = p
      },
    })
    expect(r.exitCode).toBe(9)
    expect(existsSync(observed)).toBe(false)
  })
})
