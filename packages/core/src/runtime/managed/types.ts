export interface ManagedAgentMessage {
  role: "user" | "assistant" | "system"
  content: string | unknown[]
}

export interface ManagedAgentTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ManagedAgentSpec {
  model?: string
  systemPrompt?: string
  messages: ManagedAgentMessage[]
  tools?: ManagedAgentTool[]
  maxTokens?: number
  metadata?: Record<string, string>
}

export interface ManagedAgentUsage {
  input_tokens: number
  output_tokens: number
}

export interface ManagedAgentResult {
  text: string
  stopReason: string
  toolCalls: number
  usage: ManagedAgentUsage
}

export type ManagedAgentStatus = "running" | "completed" | "failed" | "interrupted"

export interface ManagedAgentSession {
  id: string
  status(): ManagedAgentStatus
  result(): Promise<ManagedAgentResult>
  interrupt(): void
}

export interface ManagedAgentAdapter {
  readonly kind: string
  start(spec: ManagedAgentSpec): Promise<ManagedAgentSession>
}

export type ManagedAgentToolHandler = (name: string, input: unknown) => Promise<unknown> | unknown

export class ManagedAgentInterruptedError extends Error {
  constructor() {
    super("managed agent run was interrupted")
    this.name = "ManagedAgentInterruptedError"
  }
}

export class ManagedAgentIterationLimitError extends Error {
  readonly limit: number
  constructor(limit: number) {
    super(`managed agent exceeded ${limit} iterations`)
    this.name = "ManagedAgentIterationLimitError"
    this.limit = limit
  }
}
