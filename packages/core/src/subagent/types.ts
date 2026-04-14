import type { ContextObject } from "../context/types.ts"

export type IsolationMode = "none" | "worktree" | "sandbox" | "container" | "fork"
export type SubagentMode = "plan" | "execution"

export interface SubagentRestrictions {
  toolAllowlist?: string[]
  toolDenylist?: string[]
  delegateStripping?: boolean
  maxDurationMs?: number
  maxCostUsd?: number
  budgetTokens?: number
}

export interface SubagentSpec<T = unknown> {
  id: string
  parentId: string
  mode: SubagentMode
  isolation: IsolationMode
  restrictions?: SubagentRestrictions
  task: T
  context?: ContextObject
  cwd?: string
  meta?: Record<string, string>
}

export interface SubagentMetrics {
  durationMs: number
  costUsd: number
  tokens: number
  toolCalls: number
}

export interface SubagentResult<O = unknown> {
  subagentId: string
  parentId: string
  status: "success" | "failed" | "aborted" | "budget_exceeded"
  output?: O
  error?: string
  metrics: SubagentMetrics
  workdir?: string
}

export interface SubagentEventMap extends Record<string, unknown> {
  subagent_spawned: { spec: SubagentSpec; workdir?: string }
  subagent_tool_called: { subagentId: string; tool: string; cost: number; tokens: number }
  subagent_completed: { subagentId: string; result: SubagentResult }
  subagent_failed: { subagentId: string; error: string; code: string }
}

export interface Allocation {
  workdir: string
  env?: Record<string, string>
  cleanup(): Promise<void>
}
