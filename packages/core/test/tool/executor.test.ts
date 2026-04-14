import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MemoryAuditSink } from "../../src/audit/sink.ts"
import { AuditLog } from "../../src/auth/audit.ts"
import { SafetyKernel } from "../../src/kernel/index.ts"
import { PermissionEvaluator } from "../../src/permission/evaluator.ts"
import { createDefaultModerator } from "../../src/safety/moderator.ts"
import {
  ToolExecError,
  ToolPermissionError,
  ToolSafetyError,
  ToolTimeoutError,
  ToolValidationError,
} from "../../src/tool/errors.ts"
import { ToolExecutor } from "../../src/tool/executor.ts"
import { PermissionChecker } from "../../src/tool/permission.ts"
import { ToolRegistry } from "../../src/tool/registry.ts"
import type { Tool } from "../../src/tool/types.ts"

function makeTool(id: string, risk: Tool["risk"], handler: Tool["handler"]): Tool {
  return {
    id,
    name: id,
    description: "x",
    risk,
    inputSchema: {
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    },
    handler,
  }
}

describe("ToolExecutor", () => {
  let dir: string
  let registry: ToolRegistry
  let executor: ToolExecutor
  let permission: PermissionChecker
  let audit: AuditLog

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-exec-"))
    registry = new ToolRegistry()
    permission = new PermissionChecker({})
    audit = new AuditLog({ dir, fileName: "exec.log" })
    executor = new ToolExecutor({ registry, permission, audit })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("invokes tool with valid input, returns ToolResult", async () => {
    registry.register(
      makeTool("echo", "low", async (input) => ({ echoed: (input as { x: string }).x })),
    )
    const r = await executor.invoke("echo", { x: "hi" }, { agentId: "a" })
    expect(r.toolId).toBe("echo")
    expect(r.output).toEqual({ echoed: "hi" })
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })

  test("invalid input throws ToolValidationError", async () => {
    registry.register(makeTool("echo", "low", async () => null))
    await expect(executor.invoke("echo", {}, { agentId: "a" })).rejects.toBeInstanceOf(
      ToolValidationError,
    )
  })

  test("permission denied throws ToolPermissionError", async () => {
    registry.register(makeTool("danger", "high", async () => null))
    await expect(executor.invoke("danger", { x: "a" }, { agentId: "a" })).rejects.toBeInstanceOf(
      ToolPermissionError,
    )
  })

  test("timeout throws ToolTimeoutError and aborts handler", async () => {
    let aborted = false
    registry.register({
      id: "slow",
      name: "slow",
      description: "",
      risk: "low",
      inputSchema: { type: "object", properties: {} },
      timeoutMs: 30,
      handler: async (_input, _ctx, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            aborted = true
            reject(new Error("aborted"))
          })
          // never settles on its own
        }),
    })
    await expect(executor.invoke("slow", {}, { agentId: "a" })).rejects.toBeInstanceOf(
      ToolTimeoutError,
    )
    expect(aborted).toBe(true)
  })

  test("handler throw wrapped in ToolExecError", async () => {
    registry.register(
      makeTool("bad", "low", async () => {
        throw new Error("oops")
      }),
    )
    await expect(executor.invoke("bad", { x: "a" }, { agentId: "a" })).rejects.toBeInstanceOf(
      ToolExecError,
    )
  })

  test("emits tool_called and tool_completed events", async () => {
    registry.register(makeTool("echo", "low", async () => ({ ok: true })))
    const seen: string[] = []
    executor.events.on("tool_called", ({ toolId }) => seen.push(`called:${toolId}`))
    executor.events.on("tool_completed", ({ toolId }) => seen.push(`done:${toolId}`))
    await executor.invoke("echo", { x: "a" }, { agentId: "a" })
    expect(seen).toEqual(["called:echo", "done:echo"])
  })

  test("emits tool_failed on error", async () => {
    registry.register(
      makeTool("bad", "low", async () => {
        throw new Error("no")
      }),
    )
    const seen: string[] = []
    executor.events.on("tool_failed", ({ toolId, code }) => seen.push(`${toolId}:${code}`))
    await executor.invoke("bad", { x: "a" }, { agentId: "a" }).catch(() => {})
    expect(seen).toEqual(["bad:EXEC"])
  })

  test("writes audit entries per invocation", async () => {
    registry.register(makeTool("echo", "low", async () => ({ ok: true })))
    await executor.invoke("echo", { x: "a" }, { agentId: "a", sessionId: "s1" })
    const entries = await readdir(dir)
    expect(entries).toContain("exec.log")
    const content = await readFile(join(dir, "exec.log"), "utf8")
    expect(content).toContain("tool.invoke")
  })

  test("delegates permission + safety to kernel when configured", async () => {
    registry.register(makeTool("echo", "low", async (input) => ({ echoed: (input as { x: string }).x })))
    const kernel = new SafetyKernel({
      permission: new PermissionEvaluator({
        rules: [{ tool: "echo", action: "tool.invoke", decision: "deny", reason: "kernel" }],
        defaultDecision: "allow",
      }),
      safety: createDefaultModerator(),
      audit: new MemoryAuditSink(),
    })
    executor = new ToolExecutor({ registry, permission, audit, kernel })
    await expect(executor.invoke("echo", { x: "hi" }, { agentId: "a" })).rejects.toBeInstanceOf(
      ToolPermissionError,
    )
  })

  test("kernel output block is surfaced as ToolSafetyError", async () => {
    registry.register(makeTool("echo", "low", async () => ({ echoed: "make a pipe bomb" })))
    const kernel = new SafetyKernel({
      permission: new PermissionEvaluator({ rules: [], defaultDecision: "allow" }),
      safety: createDefaultModerator(),
      audit: new MemoryAuditSink(),
    })
    executor = new ToolExecutor({ registry, permission, audit, kernel })
    await expect(executor.invoke("echo", { x: "hi" }, { agentId: "a" })).rejects.toBeInstanceOf(
      ToolSafetyError,
    )
  })
})
