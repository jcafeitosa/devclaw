import { describe, expect, test } from "bun:test"
import { HookBlockedError } from "../../src/hook/errors.ts"
import { HookRegistry } from "../../src/hook/registry.ts"
import { HookRunner } from "../../src/hook/runner.ts"
import type { HookDefinition } from "../../src/hook/types.ts"

function hook(name: string, h: HookDefinition["handler"], priority = 0): HookDefinition {
  return { name, type: "pre-tool-call", priority, handler: h }
}

describe("HookRunner", () => {
  test("pass-through chain keeps payload unchanged", async () => {
    const reg = new HookRegistry()
    reg.register(hook("a", () => ({ action: "pass" })))
    reg.register(hook("b", () => ({ action: "pass" })))
    const runner = new HookRunner({ registry: reg })
    const r = await runner.run("pre-tool-call", { x: 1 })
    expect(r.action).toBe("pass")
    expect(r.payload).toEqual({ x: 1 })
  })

  test("modify flows payload through subsequent hooks", async () => {
    const reg = new HookRegistry()
    reg.register(hook("a", () => ({ action: "modify", payload: { x: 2 } }), 1))
    let seen: unknown = null
    reg.register(
      hook(
        "b",
        (ctx) => {
          seen = ctx.payload
          return { action: "pass" }
        },
        2,
      ),
    )
    const runner = new HookRunner({ registry: reg })
    const r = await runner.run("pre-tool-call", { x: 1 })
    expect(seen).toEqual({ x: 2 })
    expect(r.payload).toEqual({ x: 2 })
  })

  test("block short-circuits chain", async () => {
    const reg = new HookRegistry()
    reg.register(hook("a", () => ({ action: "block", reason: "nope" }), 1))
    let bRan = false
    reg.register(
      hook(
        "b",
        () => {
          bRan = true
          return { action: "pass" }
        },
        2,
      ),
    )
    const runner = new HookRunner({ registry: reg })
    const r = await runner.run("pre-tool-call", {})
    expect(r.action).toBe("blocked")
    expect(r.blockedBy).toBe("a")
    expect(bRan).toBe(false)
  })

  test("runOrThrow propagates block as HookBlockedError", async () => {
    const reg = new HookRegistry()
    reg.register(hook("a", () => ({ action: "block", reason: "denied" })))
    const runner = new HookRunner({ registry: reg })
    await expect(runner.runOrThrow("pre-tool-call", {})).rejects.toBeInstanceOf(HookBlockedError)
  })

  test("retry re-runs hook until pass or max", async () => {
    const reg = new HookRegistry()
    let attempts = 0
    reg.register(
      hook("a", () => {
        attempts++
        return attempts < 3 ? { action: "retry" } : { action: "pass" }
      }),
    )
    const runner = new HookRunner({ registry: reg })
    const r = await runner.run("pre-tool-call", {})
    expect(r.action).toBe("pass")
    expect(attempts).toBe(3)
  })

  test("retry over limit blocks", async () => {
    const reg = new HookRegistry()
    reg.register(hook("a", () => ({ action: "retry" })))
    const runner = new HookRunner({ registry: reg, maxRetries: 2 })
    const r = await runner.run("pre-tool-call", {})
    expect(r.action).toBe("blocked")
    expect(r.reason).toContain("retry limit")
  })

  test("suppress marks suppressed but continues chain", async () => {
    const reg = new HookRegistry()
    reg.register(hook("a", () => ({ action: "suppress" }), 1))
    let bRan = false
    reg.register(
      hook(
        "b",
        () => {
          bRan = true
          return { action: "pass" }
        },
        2,
      ),
    )
    const runner = new HookRunner({ registry: reg })
    const r = await runner.run("pre-tool-call", {})
    expect(r.suppressed).toBe(true)
    expect(bRan).toBe(true)
  })
})
