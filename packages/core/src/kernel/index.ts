import type { AuditEventInput, AuditSink } from "../audit/types.ts"
import type { PermissionEvaluator } from "../permission/evaluator.ts"
import type { Moderator } from "../safety/types.ts"
import { PermissionDeniedError, SafetyBlockedError } from "./errors.ts"
import type { KernelContext, KernelEvent, KernelOp } from "./types.ts"

export * from "./errors.ts"
export * from "./guard.ts"
export * from "./types.ts"

export interface SafetyKernelConfig {
  permission: PermissionEvaluator
  safety: Moderator
  audit: AuditSink
}

export class SafetyKernel {
  private readonly permission: PermissionEvaluator
  private readonly safety: Moderator
  private readonly audit: AuditSink

  constructor(cfg: SafetyKernelConfig) {
    this.permission = cfg.permission
    this.safety = cfg.safety
    this.audit = cfg.audit
  }

  async *invoke(ctx: KernelContext, op: KernelOp): AsyncIterable<KernelEvent> {
    const decision = await this.gatePermission(ctx, op)
    if (!decision.allow) throw decision.error

    const inputResult = await this.safety.check(op.inputText, "input")
    if (!inputResult.allowed) {
      await this.record(ctx, op, {
        kind: "safety.input_block",
        severity: "error",
        attrs: { flags: inputResult.flags, action: op.action, tool: op.tool },
      })
      throw new SafetyBlockedError("input", inputResult.flags)
    }

    const start = performance.now()
    let outputChunks = 0
    let failureCode: string | undefined
    let failure: unknown = null
    try {
      for await (const event of op.execute()) {
        if (event.type === "text") {
          const outputResult = await this.safety.check(event.content, "output")
          if (!outputResult.allowed) {
            await this.record(ctx, op, {
              kind: "safety.output_block",
              severity: "error",
              attrs: { flags: outputResult.flags, action: op.action, tool: op.tool },
            })
            const blocked = new SafetyBlockedError("output", outputResult.flags)
            failureCode = blocked.code
            failure = blocked
            throw blocked
          }
          outputChunks++
        }
        if (event.type === "completed") outputChunks++
        yield event
      }
    } catch (err) {
      failure = err
      failureCode = (err as { code?: string }).code ?? "EXEC_FAILED"
      throw err
    } finally {
      await this.record(ctx, op, {
        kind: failure ? `${op.kind}.fail` : `${op.kind}.complete`,
        severity: failure ? "error" : "info",
        attrs: {
          action: op.action,
          tool: op.tool,
          durationMs: Math.round(performance.now() - start),
          outputLen: outputChunks,
          errorCode: failureCode,
        },
      })
    }
  }

  private async gatePermission(
    ctx: KernelContext,
    op: KernelOp,
  ): Promise<{ allow: true } | { allow: false; error: Error }> {
    const result = this.permission.evaluate({
      tool: op.tool,
      action: op.action,
      input: op.input ?? {},
      context: {},
    })

    if (result.decision === "deny") {
      await this.record(ctx, op, {
        kind: "permission.deny",
        severity: "warn",
        attrs: { action: op.action, tool: op.tool, reason: result.reason },
      })
      return { allow: false, error: new PermissionDeniedError(op.action, op.tool, result.reason) }
    }

    if (result.decision === "ask") {
      await this.record(ctx, op, {
        kind: "permission.ask",
        severity: "info",
        attrs: { action: op.action, tool: op.tool, reason: result.reason },
      })
      if (!ctx.approvalChannel) {
        await this.record(ctx, op, {
          kind: "permission.deny",
          severity: "warn",
          attrs: { action: op.action, tool: op.tool, reason: "no_approval_channel" },
        })
        return {
          allow: false,
          error: new PermissionDeniedError(op.action, op.tool, "no_approval_channel"),
        }
      }
      const approved = await ctx.approvalChannel.request(op)
      if (!approved) {
        await this.record(ctx, op, {
          kind: "permission.deny",
          severity: "warn",
          attrs: { action: op.action, tool: op.tool, reason: "user_refused" },
        })
        return {
          allow: false,
          error: new PermissionDeniedError(op.action, op.tool, "user_refused"),
        }
      }
    }

    return { allow: true }
  }

  private async record(
    ctx: KernelContext,
    op: KernelOp,
    partial: Pick<AuditEventInput, "kind" | "severity" | "attrs">,
  ): Promise<void> {
    await this.audit.record({
      source: "kernel",
      kind: partial.kind,
      severity: partial.severity,
      attrs: partial.attrs ?? {},
      actor: ctx.actor,
      target: op.target,
      taskId: ctx.taskId,
      correlationId: ctx.correlationId,
      agentId: ctx.actor,
    })
  }
}
