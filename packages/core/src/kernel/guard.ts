import type { Bridge, BridgeEvent, BridgeRequest } from "../bridge/types.ts"
import type { ToolExecutor } from "../tool/executor.ts"
import type { ToolInvocationCtx, ToolResult } from "../tool/types.ts"
import type { SafetyKernel } from "./index.ts"
import type { KernelContext, KernelEvent } from "./types.ts"

function toRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return { value: input }
}

function toText(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export async function guardedToolInvoke<O = unknown>(
  kernel: SafetyKernel,
  executor: ToolExecutor,
  ctx: KernelContext,
  toolId: string,
  input: unknown,
  invocCtx: ToolInvocationCtx = {},
): Promise<ToolResult<O>> {
  let result: ToolResult<O> | null = null

  const iter = kernel.invoke(ctx, {
    kind: "tool",
    tool: toolId,
    action: "tool.invoke",
    inputText: toText(input),
    input: toRecord(input),
    target: toolId,
    execute: async function* (): AsyncGenerator<KernelEvent> {
      result = await executor.invoke<O>(toolId, input, invocCtx)
      yield { type: "text", content: toText(result.output) }
      yield { type: "completed" }
    },
  })

  for await (const _event of iter) {
    // drain — kernel owns permission/safety/audit
  }

  if (!result) throw new Error(`guardedToolInvoke: ${toolId} produced no result`)
  return result
}

export function guardedBridgeExecute(
  kernel: SafetyKernel,
  bridge: Bridge,
  ctx: KernelContext,
  req: BridgeRequest,
): AsyncIterable<BridgeEvent> {
  const iter = kernel.invoke(ctx, {
    kind: "bridge",
    tool: bridge.cli,
    action: "bridge.execute",
    inputText: req.prompt,
    input: {
      cli: bridge.cli,
      taskId: req.taskId,
      agentId: req.agentId,
      cwd: req.cwd,
      model: req.model,
    },
    target: bridge.cli,
    execute: async function* (): AsyncGenerator<KernelEvent> {
      for await (const event of bridge.execute(req)) {
        yield event as KernelEvent
      }
    },
  })
  return iter as AsyncIterable<BridgeEvent>
}
