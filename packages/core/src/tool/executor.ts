import type { AuditLog } from "../auth/audit.ts"
import { EventEmitter } from "../util/event_emitter.ts"
import {
  type ToolErrorCode,
  ToolExecError,
  ToolPermissionError,
  ToolTimeoutError,
  ToolValidationError,
} from "./errors.ts"
import type { PermissionChecker } from "./permission.ts"
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
  permission: PermissionChecker
  audit?: AuditLog
  defaultTimeoutMs?: number
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

    const decision = await this.cfg.permission.check(tool, input, ctx)
    if (decision === "deny") {
      const err = new ToolPermissionError(id, ctx.agentId ?? "anonymous", "permission check denied")
      this.fail(id, err, performance.now() - started)
      await this.writeAudit("tool.invoke.fail", ctx, id, { code: err.code })
      throw err
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
      const err = new ToolExecError(id, cause)
      this.fail(id, err, durationMs)
      await this.writeAudit("tool.invoke.fail", ctx, id, { code: err.code })
      throw err
    }
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
