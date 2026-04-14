import { describe, expect, test } from "bun:test"
import { HookRegistry } from "../../src/hook/registry.ts"
import { HookRunner } from "../../src/hook/runner.ts"
import { HookedToolExecutor } from "../../src/hook/tool_wrapper.ts"
import { ToolExecutor } from "../../src/tool/executor.ts"
import { PermissionChecker } from "../../src/tool/permission.ts"
import { ToolRegistry } from "../../src/tool/registry.ts"
import type { Tool } from "../../src/tool/types.ts"

function tool(id: string, handler: Tool["handler"]): Tool {
  return {
    id,
    name: id,
    description: "",
    risk: "low",
    inputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
    handler,
  }
}

function makePipeline() {
  const registry = new ToolRegistry()
  const permission = new PermissionChecker({})
  const executor = new ToolExecutor({ registry, permission })
  const hooks = new HookRegistry()
  const runner = new HookRunner({ registry: hooks })
  const wrapped = new HookedToolExecutor(executor, runner)
  return { registry, hooks, wrapped }
}

describe("HookedToolExecutor", () => {
  test("runs tool and returns output when no hooks", async () => {
    const { registry, wrapped } = makePipeline()
    registry.register(tool("echo", async (input) => ({ echoed: (input as { x: string }).x })))
    const r = await wrapped.invoke("echo", { x: "hi" })
    expect(r.output).toEqual({ echoed: "hi" })
  })

  test("pre hook block prevents tool execution", async () => {
    const { registry, hooks, wrapped } = makePipeline()
    let ran = false
    registry.register(
      tool("echo", async () => {
        ran = true
        return null
      }),
    )
    hooks.register({
      name: "deny",
      type: "pre-tool-call",
      handler: () => ({ action: "block", reason: "policy" }),
    })
    await expect(wrapped.invoke("echo", { x: "a" })).rejects.toThrow(/policy/)
    expect(ran).toBe(false)
  })

  test("pre hook modify rewrites input passed to tool", async () => {
    const { registry, hooks, wrapped } = makePipeline()
    let received: unknown = null
    registry.register(
      tool("echo", async (input) => {
        received = input
        return null
      }),
    )
    hooks.register({
      name: "upcase",
      type: "pre-tool-call",
      handler: (ctx) => ({
        action: "modify",
        payload: {
          ...(ctx.payload as { toolId: string; ctx: unknown; input: { x: string } }),
          input: { x: ((ctx.payload as { input: { x: string } }).input.x ?? "").toUpperCase() },
        },
      }),
    })
    await wrapped.invoke("echo", { x: "hi" })
    expect(received).toEqual({ x: "HI" })
  })

  test("error hook fires on tool failure + error re-thrown", async () => {
    const { registry, hooks, wrapped } = makePipeline()
    registry.register(
      tool("boom", async () => {
        throw new Error("no")
      }),
    )
    let called = false
    hooks.register({
      name: "watch",
      type: "on-tool-error",
      handler: () => {
        called = true
        return { action: "pass" }
      },
    })
    await expect(wrapped.invoke("boom", { x: "a" })).rejects.toThrow()
    expect(called).toBe(true)
  })
})
