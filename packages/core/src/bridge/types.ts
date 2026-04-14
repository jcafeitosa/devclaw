import type { ContextObject } from "../context/types.ts"

export type CliId = "claude" | "codex" | "gemini" | "aider" | (string & {})

export type BridgeOutputFormat = "json" | "text" | "stream"

export interface BridgeConstraints {
  maxTokens?: number
  maxDurationMs?: number
  maxCostUsd?: number
  allowedTools?: string[]
}

export interface BridgeWorkspace {
  filesRelevant?: string[]
  skillsEnabled?: string[]
}

export interface BridgeRequest {
  taskId: string
  agentId: string
  cli: CliId
  cwd: string
  prompt: string
  context?: ContextObject
  constraints?: BridgeConstraints
  workspace?: BridgeWorkspace
  outputFormat?: BridgeOutputFormat
  model?: string
}

export interface FileChange {
  path: string
  action: "create" | "modify" | "delete"
  diff?: string
}

export interface GitCommit {
  sha: string
  message: string
}

export interface BridgeMetrics {
  tokensIn: number
  tokensOut: number
  cachedTokens?: number
  costUsd: number
  durationMs: number
  cliVersion?: string
  modelUsed?: string
}

export type BridgeEvent =
  | { type: "started"; at: number }
  | { type: "thought"; content: string }
  | { type: "tool_call"; tool: string; args?: unknown }
  | { type: "tool_result"; tool: string; result?: unknown }
  | { type: "text"; content: string }
  | { type: "file_change"; path: string; diff?: string; action?: FileChange["action"] }
  | { type: "commit"; sha: string; message: string }
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string }
  | { type: "completed"; summary?: string }
  | { type: "error"; message: string; recoverable?: boolean }

export interface BridgeResponse {
  taskId: string
  cli: CliId
  status: "success" | "error" | "timeout" | "cancelled"
  output: {
    text: string
    filesChanged?: FileChange[]
    commits?: GitCommit[]
  }
  metrics: BridgeMetrics
  events: BridgeEvent[]
  error?: { code: string; message: string; recoverable: boolean }
}

export interface Capabilities {
  modes: Array<"agentic" | "oneshot">
  contextWindow: number
  supportsTools: boolean
  supportsSubagents: boolean
  supportsStreaming: boolean
  supportsMultimodal: boolean
  supportsWebSearch: boolean
  supportsMcp: boolean
  preferredFor: string[]
}

export interface CostEstimate {
  costUsd: number
  tokensIn: number
  tokensOut: number
  subscriptionCovered: boolean
}

export interface AuthStatus {
  authed: boolean
  details?: Record<string, string>
}

export interface Bridge {
  readonly cli: CliId
  isAvailable(): Promise<boolean>
  isAuthenticated(): Promise<AuthStatus>
  capabilities(): Capabilities
  estimateCost(req: BridgeRequest): CostEstimate
  execute(req: BridgeRequest): AsyncIterable<BridgeEvent>
  cancel(taskId: string): Promise<void>
}
