import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "../../src/tool/registry.ts"
import type { Tool } from "../../src/tool/types.ts"

function makeTool(id: string): Tool<{ x: string }, { ok: boolean }> {
  return {
    id,
    name: id,
    description: "x",
    risk: "low",
    inputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
    async handler() {
      return { ok: true }
    },
  }
}

describe("ToolRegistry", () => {
  test("register + get + list", () => {
    const r = new ToolRegistry()
    r.register(makeTool("a"))
    r.register(makeTool("b"))
    expect(r.get("a").id).toBe("a")
    expect(
      r
        .list()
        .map((t) => t.id)
        .sort(),
    ).toEqual(["a", "b"])
  })

  test("get unknown throws", () => {
    const r = new ToolRegistry()
    expect(() => r.get("x")).toThrow(/not registered/i)
  })

  test("register duplicate throws", () => {
    const r = new ToolRegistry()
    r.register(makeTool("a"))
    expect(() => r.register(makeTool("a"))).toThrow(/already/i)
  })

  test("replace swaps existing tool + emits 'replaced'", () => {
    const r = new ToolRegistry()
    r.register(makeTool("a"))
    let replaced = false
    r.events.on("replaced", ({ id }) => {
      if (id === "a") replaced = true
    })
    const next = makeTool("a")
    r.replace(next)
    expect(r.get("a")).toBe(next as unknown as Tool)
    expect(replaced).toBe(true)
  })

  test("unregister removes tool + emits 'removed'", () => {
    const r = new ToolRegistry()
    r.register(makeTool("a"))
    let removed = ""
    r.events.on("removed", ({ id }) => {
      removed = id
    })
    r.unregister("a")
    expect(() => r.get("a")).toThrow()
    expect(removed).toBe("a")
  })

  test("register emits 'registered'", () => {
    const r = new ToolRegistry()
    const seen = { id: null as string | null }
    r.events.on("registered", ({ id }) => {
      seen.id = id
    })
    r.register(makeTool("a"))
    expect(seen.id).toBe("a")
  })

  test("has() reports presence", () => {
    const r = new ToolRegistry()
    r.register(makeTool("a"))
    expect(r.has("a")).toBe(true)
    expect(r.has("b")).toBe(false)
  })
})
