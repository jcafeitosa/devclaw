export type AuditSeverity = "info" | "warn" | "error" | "critical"

export interface AuditEventInput {
  source: string
  kind: string
  severity?: AuditSeverity
  attrs?: Record<string, unknown>
  actor?: string
  target?: string
  taskId?: string
  agentId?: string
  correlationId?: string
}

export interface AuditEvent {
  id: string
  at: number
  source: string
  kind: string
  severity: AuditSeverity
  attrs: Record<string, unknown>
  actor?: string
  target?: string
  taskId?: string
  agentId?: string
  correlationId?: string
  prevHash: string
  hash: string
}

export interface AuditQuery {
  source?: string
  kind?: string
  severity?: AuditSeverity
  actor?: string
  taskId?: string
  agentId?: string
  fromAt?: number
  toAt?: number
}

export interface AuditSink {
  record(event: AuditEventInput): Promise<AuditEvent>
  flush?(): Promise<void>
}
