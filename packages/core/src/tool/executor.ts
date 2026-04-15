import type { AuditLog } from "../auth/audit.ts"
import { PermissionDeniedError, SafetyBlockedError, type SafetyKernel } from "../kernel/index.ts"
import type { Moderator } from "../safety/types.ts"
import { EventEmitter } from "../util/event_emitter.ts"
import {
  type ToolErrorCode,
  ToolExecError,
  ToolPermissionError,
  ToolSafetyError,
  ToolTimeoutError,
  ToolValidationError,
} from "./errors.ts"
import type { ToolRegistry } from "./registry.ts"
import type { Tool, ToolInvocationCtx, ToolResult } from "./types.ts"
import { validateInput } from "./validate.ts"

export interface ToolExecutorEvents extends Record<string, unknown> {
  tool_called: { toolId: string; agentId?: string; input: unknown }
  tool_completed: { toolId: string; durationMs: number; output: unknown }
  tool_failed: { toolId: string; code: ToolErrorCode; durationMs: number; reason: string }
}

export interface ToolExecutorConfig {
  registry: ToolRegistry
  permission: {
    check(tool: Tool, input: unknown, ctx: ToolInvocationCtx): Promise<"allow" | "deny">
  }
  audit?: AuditLog
  defaultTimeoutMs?: number
  /** Safety kernel — scans stringified input + output. Per ADR-022 non-bypassable. */
  moderator?: Moderator
  kernel?: SafetyKernel
}

export class ToolExecutor {
  private readonly cfg: ToolExecutorConfig
  readonly events = new EventEmitter<ToolExecutorEvents>()

  constructor(cfg: ToolExecutorConfig) {
    this.cfg = cfg
  }

  async invoke<O = unknown>(
    id: string,
    input: unknown,
    ctx: ToolInvocationCtx = {},
  ): Promise<ToolResult<O>> {
    const tool = this.cfg.registry.get(id) as Tool<unknown, O>
    const started = performance.now()
    this.events.emit("tool_called", { toolId: id, agentId: ctx.agentId, input })

    const v = validateInput(tool.inputSchema, input)
    if (!v.ok) {
      const err = new ToolValidationError(id, v.issues)
      this.fail(id, err, performance.now() - started)
      await this.writeAudit("tool.invoke.fail", ctx, id, { code: err.code })
      throw err
    }

    if (this.cfg.kernel) {
      return this.invokeWithKernel(tool, id, input, ctx, started)
    }

    const decision = await this.cfg.permission.check(tool, input, ctx)
    if (decision === "deny") {
      const err = new ToolPermissionError(id, ctx.agentId ?? "anonymous", "permission check denied")
      this.fail(id, err, performance.now() - started)
      await this.writeAudit("tool.invoke.fail", ctx, id, { code: err.code })
      throw err
    }

    if (this.cfg.moderator) {
      const r = await this.cfg.moderator.check(JSON.stringify(input), "input")
      if (!r.allowed) {
        const err = new ToolSafetyError(
          id,
          "input",
          r.flags.map((f) => f.category),
        )
        this.fail(id, err, performance.now() - started)
        await this.writeAudit("tool.invoke.fail", ctx, id, { code: err.code })
        throw err
      }
    }

    const timeoutMs = tool.timeoutMs ?? this.cfg.defaultTimeoutMs ?? 30_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const output = await Promise.race([
        tool.handler(input, ctx, controller.signal),
        new Promise<never>((_res, rej) => {
          controller.signal.addEventListener("abort", () => {
            rej(new ToolTimeoutError(id, timeoutMs))
          })
        }),
      ])
      clearTimeout(timer)
      if (this.cfg.moderator) {
        const r = await this.cfg.moderator.check(JSON.stringify(output), "output")
        if (!r.allowed) {
          const err = new ToolSafetyError(
            id,
            "output",
            r.flags.map((f) => f.category),
          )
          this.fail(id, err, performance.now() - started)
          await this.writeAudit("tool.invoke.fail", ctx, id, { code: err.code })
          throw err
        }
      }
      const durationMs = performance.now() - started
      this.events.emit("tool_completed", { toolId: id, durationMs, output })
      await this.writeAudit("tool.invoke.ok", ctx, id, { durationMs: Math.round(durationMs) })
      return { toolId: id, output, durationMs }
    } catch (cause) {
      clearTimeout(timer)
      const durationMs = performance.now() - started
      controller.abort()
      if (cause instanceof ToolTimeoutError) {
        this.fail(id, cause, durationMs)
        await this.writeAudit("tool.invoke.fail", ctx, id, { code: cause.code })
        throw cause
      }
      if (cause instanceof ToolSafetyError) throw cause
      const err = new ToolExecError(id, cause)
      this.fail(id, err, durationMs)
      await this.writeAudit("tool.invoke.fail", ctx, id, { code: err.code })
      throw err
    }
  }

  private async invokeWithKernel<O>(
    tool: Tool<unknown, O>,
    id: string,
    input: unknown,
    ctx: ToolInvocationCtx,
    started: number,
  ): Promise<ToolResult<O>> {
    const timeoutMs = tool.timeoutMs ?? this.cfg.defaultTimeoutMs ?? 30_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let output: O | undefined

    try {
      for await (const _event of this.cfg.kernel!.invoke(
        {
          actor: ctx.agentId ?? "anonymous",
          sessionId: ctx.sessionId,
          taskId: ctx.correlationId,
          correlationId: ctx.correlationId,
        },
        {
          kind: "tool",
          tool: id,
          action: "tool.invoke",
          inputText: stringifyForKernel(input),
          input: isRecord(input) ? input : {},
          target: id,
          execute: () =>
            this.executeTool(tool, input, ctx, controller, timeoutMs, (value) => {
              output = value
            }),
        },
      )) {
        // Kernel exists for permission/safety/audit gating; ToolExecutor only returns final result.
      }

      clearTimeout(timer)
      const durationMs = performance.now() - started
      this.events.emit("tool_completed", { toolId: id, durationMs, output })
      return { toolId: id, output: output as O, durationMs }
    } catch (cause) {
      clearTimeout(timer)
      controller.abort()
      const durationMs = performance.now() - started
      if (cause instanceof PermissionDeniedError) {
        const err = new ToolPermissionError(id, ctx.agentId ?? "anonymous", cause.reason ?? "deny")
        this.fail(id, err, durationMs)
        throw err
      }
      if (cause instanceof SafetyBlockedError) {
        const err = new ToolSafetyError(
          id,
          cause.mode,
          cause.flags.map((flag) => flag.category),
        )
        this.fail(id, err, durationMs)
        throw err
      }
      if (cause instanceof ToolTimeoutError) {
        this.fail(id, cause, durationMs)
        throw cause
      }
      if (cause instanceof ToolExecError) {
        this.fail(id, cause, durationMs)
        throw cause
      }
      const err = new ToolExecError(id, cause)
      this.fail(id, err, durationMs)
      throw err
    }
  }

  private async *executeTool<O>(
    tool: Tool<unknown, O>,
    input: unknown,
    ctx: ToolInvocationCtx,
    controller: AbortController,
    timeoutMs: number,
    capture: (output: O) => void,
  ) {
    const output = await Promise.race([
      tool.handler(input, ctx, controller.signal),
      new Promise<never>((_res, rej) => {
        controller.signal.addEventListener("abort", () => {
          rej(new ToolTimeoutError(tool.id, timeoutMs))
        })
      }),
    ])
    capture(output)
    const text = stringifyForKernel(output)
    if (text) yield { type: "text" as const, content: text }
    yield { type: "completed" as const }
  }

  private fail(toolId: string, err: { code: ToolErrorCode; message: string }, durationMs: number) {
    this.events.emit("tool_failed", {
      toolId,
      code: err.code,
      durationMs,
      reason: err.message,
    })
  }

  private async writeAudit(
    event: "tool.invoke.ok" | "tool.invoke.fail",
    ctx: ToolInvocationCtx,
    toolId: string,
    extra: Record<string, string | number>,
  ): Promise<void> {
    if (!this.cfg.audit) return
    const meta: Record<string, string> = { toolId }
    if (ctx.sessionId) meta.sessionId = ctx.sessionId
    if (ctx.correlationId) meta.correlationId = ctx.correlationId
    for (const [k, v] of Object.entries(extra)) meta[k] = String(v)
    await this.cfg.audit.append({
      event,
      provider: toolId,
      accountId: ctx.agentId ?? "anonymous",
      meta,
    })
  }
}

function stringifyForKernel(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (!value) return ""
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
