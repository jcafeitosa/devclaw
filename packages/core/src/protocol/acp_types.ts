export interface ACPCapabilities {
  streaming: boolean
  tools: boolean
  subagents: boolean
  multimodal: boolean
  permissionPrompts: boolean
  fileSystemAccess: boolean
  terminalAccess: boolean
}

export const DEFAULT_ACP_CAPABILITIES: ACPCapabilities = {
  streaming: true,
  tools: true,
  subagents: true,
  multimodal: false,
  permissionPrompts: true,
  fileSystemAccess: true,
  terminalAccess: false,
}

export interface ACPInitializeParams {
  clientName: string
  clientVersion: string
  capabilities: ACPCapabilities
}

export interface ACPInitializeResult {
  agentName: string
  agentVersion: string
  capabilities: ACPCapabilities
  sessionDefaults?: Record<string, string>
}

export interface ACPSessionInfo {
  id: string
  createdAt: number
  cwd?: string
  agentName?: string
  state?: ACPSessionState
  updatedAt?: number
}

export type ACPSessionState = "idle" | "running" | "awaiting_permission" | "closed"

export interface ACPSessionNewParams {
  cwd?: string
  initialContext?: Record<string, string>
}

export interface ACPSessionLoadParams {
  sessionId: string
}

export type ACPPromptContent =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "resource"; uri: string; text?: string }

export interface ACPPromptParams {
  sessionId: string
  prompt: string | ACPPromptContent[]
  meta?: Record<string, string>
}

export type ACPStreamKind = "text" | "thought" | "tool_call" | "tool_result" | "log" | "error"

export interface ACPStreamChunk {
  sessionId: string
  kind: ACPStreamKind
  content?: string
  payload?: unknown
  at: number
}

export interface ACPStreamUpdate {
  kind: ACPStreamKind
  content?: string
  payload?: unknown
}

export interface ACPPromptResult {
  sessionId: string
  summary: string
  toolCalls: number
  durationMs: number
}

export interface ACPPermissionRequest {
  toolId: string
  input: unknown
  reason: string
  riskLevel: "low" | "medium" | "high" | "critical"
}

export interface ACPPermissionDecision {
  allow: boolean
  reason?: string
}
