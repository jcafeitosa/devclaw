export type HookType =
  | "pre-tool-call"
  | "post-tool-call"
  | "on-tool-error"
  | "pre-agent-spawn"
  | "post-agent-complete"
  | "pre-task-complete"
  | "post-task-complete"
  | "on-approval-needed"
  | "on-cost-threshold"
  | "on-incident"
  | "on-checkpoint-create"
  | "on-skill-evolution"
  | "on-context-loaded"
  | "on-prompt-built"

export interface HookContext<P = unknown> {
  type: HookType
  payload: P
  meta?: Record<string, string>
}

export type HookAction = "pass" | "block" | "modify" | "suppress" | "retry"

export interface HookResult<P = unknown> {
  action: HookAction
  payload?: P
  reason?: string
  retryAfterMs?: number
}

export type HookHandler<P = unknown> = (
  ctx: HookContext<P>,
) => Promise<HookResult<P>> | HookResult<P>

export interface HookDefinition<P = unknown> {
  name: string
  type: HookType
  priority?: number
  enabled?: boolean
  handler: HookHandler<P>
}

export type GateType =
  | "pre-design"
  | "pre-implementation"
  | "pre-production-code"
  | "pre-completion"
  | "pre-merge"

export interface GateContext {
  gate: GateType
  actor: string
  scope?: string
  meta?: Record<string, string>
}

export type GateCheck = (ctx: GateContext) => Promise<GateCheckResult> | GateCheckResult

export interface GateCheckResult {
  ok: boolean
  reasons?: string[]
}
