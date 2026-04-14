export interface ContextRequest {
  goal: string
  expectedOutput: string
  hints?: string[]
  background?: string
  constraints?: string[]
  dependencies?: string[]
  risks?: string[]
  budgetTokens?: number
  minQualityScore?: number
  agentId?: string
  sessionId?: string
}

export interface ContextItem {
  id: string
  sourceId: string
  kind: "text" | "code" | "doc" | "data" | "memory" | "event" | string
  content: string
  score?: number
  tokens?: number
  meta?: Record<string, string>
}

export interface ContextObject {
  goal: string
  expectedOutput: string
  background?: string
  constraints: string[]
  dependencies: string[]
  risks: string[]
  relevantData: ContextItem[]
  items: ContextItem[]
  diagnostics: ContextDiagnostic[]
  totals: { items: number; tokens: number }
}

export interface ContextDiagnostic {
  level: "info" | "warn" | "error"
  sourceId?: string
  message: string
}

export interface ContextSource {
  id: string
  timeoutMs?: number
  collect(request: ContextRequest, signal?: AbortSignal): Promise<ContextItem[]>
}

export interface Ranker {
  score(request: ContextRequest, item: ContextItem): number
}
