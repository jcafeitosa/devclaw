import { describe, expect, test } from "bun:test"
import { HookRegistry } from "../../src/hook/registry.ts"
import type { HookDefinition } from "../../src/hook/types.ts"

function hook(name: string, priority?: number): HookDefinition {
  return {
    name,
    type: "pre-tool-call",
    priority,
    handler: () => ({ action: "pass" }),
  }
}

describe("HookRegistry", () => {
  test("register + forType returns hooks in priority order", () => {
    const r = new HookRegistry()
    r.register(hook("b", 5))
    r.register(hook("a", 1))
    r.register(hook("c", 5))
    expect(r.forType("pre-tool-call").map((h) => h.name)).toEqual(["a", "b", "c"])
  })

  test("duplicate name throws", () => {
    const r = new HookRegistry()
    r.register(hook("x"))
    expect(() => r.register(hook("x"))).toThrow(/already/i)
  })

  test("disable excludes from forType but keeps in list", () => {
    const r = new HookRegistry()
    r.register(hook("x"))
    r.disable("x")
    expect(r.forType("pre-tool-call")).toEqual([])
    expect(r.list().length).toBe(1)
    r.enable("x")
    expect(r.forType("pre-tool-call")).toHaveLength(1)
  })

  test("unregister removes from both lists", () => {
    const r = new HookRegistry()
    r.register(hook("x"))
    r.unregister("x")
    expect(r.get("x")).toBeUndefined()
    expect(r.forType("pre-tool-call")).toEqual([])
  })

  test("negative priority runs before zero/positive", () => {
    const r = new HookRegistry()
    r.register(hook("high", 10))
    r.register(hook("first", -10))
    expect(r.forType("pre-tool-call").map((h) => h.name)).toEqual(["first", "high"])
  })
})
