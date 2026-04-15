export type RiskLevel = "low" | "medium" | "high" | "critical"

export interface SchemaProperty {
  type: "string" | "number" | "boolean" | "object" | "array"
  enum?: readonly string[]
  description?: string
  properties?: Record<string, SchemaProperty>
  items?: SchemaProperty
  required?: readonly string[]
}

export interface ToolSchema<_I = unknown> {
  type: "object"
  properties: Record<string, SchemaProperty>
  required?: readonly string[]
  description?: string
}

export interface ToolInvocationCtx {
  agentId?: string
  sessionId?: string
  correlationId?: string
}

export interface Tool<I = unknown, O = unknown> {
  id: string
  kind?: string
  name?: string
  description: string
  risk: RiskLevel
  inputSchema: ToolSchema<I>
  timeoutMs?: number
  handler(input: I, ctx?: ToolInvocationCtx, signal?: AbortSignal): Promise<O>
}

export interface ToolResult<O = unknown> {
  toolId: string
  output: O
  durationMs: number
}
