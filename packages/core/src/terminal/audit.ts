export interface TerminalAuditStart {
  kind: "start"
  at: number
  command: string[]
  cwd?: string
  reason?: string
}

export interface TerminalAuditWrite {
  kind: "write"
  at: number
  bytes: number
}

export interface TerminalAuditKill {
  kind: "kill"
  at: number
  signal: string
}

export interface TerminalAuditExit {
  kind: "exit"
  at: number
  exitCode: number
  durationMs: number
}

export interface TerminalAuditDenied {
  kind: "denied"
  at: number
  command: string[]
  reason?: string
}

export type TerminalAuditEvent =
  | TerminalAuditStart
  | TerminalAuditWrite
  | TerminalAuditKill
  | TerminalAuditExit
  | TerminalAuditDenied

export type TerminalAuditSink = (event: TerminalAuditEvent) => void
