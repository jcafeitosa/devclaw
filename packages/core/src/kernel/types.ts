import type { ModerationFlag } from "../safety/types.ts"

export type KernelOpKind = "bridge" | "tool" | "provider" | "cognitive"

export interface KernelEventText {
  type: "text"
  content: string
}

export interface KernelEventLog {
  type: "log"
  level: "info" | "warn" | "error"
  message: string
}

export interface KernelEventToolCall {
  type: "tool_call"
  id: string
  name: string
  arguments: unknown
}

export interface KernelEventToolResult {
  type: "tool_result"
  id: string
  result: unknown
}

export interface KernelEventError {
  type: "error"
  message: string
  recoverable?: boolean
}

export interface KernelEventCompleted {
  type: "completed"
}

export type KernelEvent =
  | KernelEventText
  | KernelEventLog
  | KernelEventToolCall
  | KernelEventToolResult
  | KernelEventError
  | KernelEventCompleted

export interface KernelOp {
  kind: KernelOpKind
  tool: string
  action: string
  inputText: string
  input?: Record<string, unknown>
  target?: string
  execute: () => AsyncIterable<KernelEvent>
}

export interface ApprovalChannel {
  request(op: KernelOp): Promise<boolean>
}

export interface KernelContext {
  actor: string
  sessionId?: string
  taskId?: string
  correlationId?: string
  approvalChannel?: ApprovalChannel
}

export interface SafetyKernelTelemetry {
  kind: KernelOpKind
  action: string
  tool: string
  durationMs: number
  outputLen: number
  inputFlags?: ModerationFlag[]
  outputFlags?: ModerationFlag[]
  denied?: boolean
  errorCode?: string
}
