import type { ToolExecutor } from "../tool/executor.ts"
import type { ToolInvocationCtx, ToolResult } from "../tool/types.ts"
import type { HookRunner } from "./runner.ts"

export interface PreToolPayload {
  toolId: string
  input: unknown
  ctx: ToolInvocationCtx
}

export interface PostToolPayload extends PreToolPayload {
  output: unknown
  durationMs: number
}

export interface ToolErrorPayload extends PreToolPayload {
  error: string
  code?: string
}

export class HookedToolExecutor {
  constructor(
    private readonly executor: ToolExecutor,
    private readonly runner: HookRunner,
  ) {}

  async invoke<O = unknown>(
    toolId: string,
    input: unknown,
    ctx: ToolInvocationCtx = {},
  ): Promise<ToolResult<O>> {
    const preResult = await this.runner.run<PreToolPayload>("pre-tool-call", {
      toolId,
      input,
      ctx,
    })
    if (preResult.action === "blocked") {
      const error = `pre-tool-call blocked by '${preResult.blockedBy}': ${preResult.reason}`
      await this.runner.run<ToolErrorPayload>("on-tool-error", {
        toolId,
        input,
        ctx,
        error,
        code: "HOOK_BLOCKED",
      })
      throw new Error(error)
    }
    const effectiveInput = preResult.payload.input
    try {
      const result = await this.executor.invoke<O>(toolId, effectiveInput, preResult.payload.ctx)
      const post = await this.runner.run<PostToolPayload>("post-tool-call", {
        toolId,
        input: effectiveInput,
        ctx: preResult.payload.ctx,
        output: result.output,
        durationMs: result.durationMs,
      })
      if (post.action === "blocked") {
        throw new Error(`post-tool-call blocked by '${post.blockedBy}': ${post.reason}`)
      }
      return {
        ...result,
        output: (post.payload.output ?? result.output) as O,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.runner.run<ToolErrorPayload>("on-tool-error", {
        toolId,
        input: effectiveInput,
        ctx: preResult.payload.ctx,
        error: message,
      })
      throw err
    }
  }
}
