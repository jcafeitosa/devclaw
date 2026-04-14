export type TriggerType =
  | "test-failure"
  | "lint-error"
  | "compile-error"
  | "type-error"
  | "runtime-exception"
  | "low-eval-score"
  | "user-feedback"
  | "cost-overrun"
  | "latency-spike"
  | "hallucination"
  | "unknown"

export type ErrorClass =
  | "code-defect"
  | "style"
  | "types"
  | "runtime"
  | "quality"
  | "budget"
  | "performance"
  | "reasoning"
  | "unknown"

export interface ErrorSignal {
  id: string
  trigger: TriggerType
  message: string
  detail?: string
  stack?: string
  at: number
  taskId?: string
  meta?: Record<string, string>
}

export interface Hypothesis {
  id: string
  description: string
  likelihood: number
  suggestedFixKind: string
  meta?: Record<string, string>
}

export interface FixAttempt {
  id: string
  hypothesisId: string
  startedAt: number
  completedAt?: number
  success: boolean
  output?: string
  costUsd?: number
  tokens?: number
}

export interface VerificationResult {
  ok: boolean
  reason?: string
  metrics?: Record<string, number>
}

export type EscalationDecision = "resolved" | "retry" | "specialist" | "human"

export interface CorrectionOutcome {
  signal: ErrorSignal
  attempts: FixAttempt[]
  decision: EscalationDecision
  errorClass: ErrorClass
  usedCostUsd: number
  usedTokens: number
  durationMs: number
}

export interface CorrectionEventMap extends Record<string, unknown> {
  correction_started: { signal: ErrorSignal }
  hypothesis_generated: { hypotheses: Hypothesis[] }
  fix_attempt_started: { attempt: FixAttempt }
  fix_attempt_finished: { attempt: FixAttempt; verification: VerificationResult }
  correction_resolved: { outcome: CorrectionOutcome }
  correction_escalated: { outcome: CorrectionOutcome }
}
