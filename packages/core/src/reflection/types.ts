import type { RunResult, Step, StepState } from "../cognitive/types.ts"

export type CriterionKind = "programmatic" | "llm"

export interface EvaluationCriterion {
  id: string
  description: string
  kind: CriterionKind
  weight?: number
  check?: (step: Step, state: StepState) => Promise<number>
  prompt?: string
}

export interface CriterionResult {
  id: string
  score: number
  weight: number
  feedback?: string
}

export interface Evaluation {
  stepId: string
  score: number
  passed: boolean
  criteria: CriterionResult[]
  feedback?: string
}

export type CorrectionAction = "retry" | "split" | "replace" | "skip" | "abort"

export interface CorrectionProposal {
  action: CorrectionAction
  stepId: string
  rationale: string
  replacement?: Partial<Step>
}

export type ReflectionOutcome = "all_ok" | "partial" | "degraded" | "failed"

export interface Lesson {
  id: string
  content: string
  tags: string[]
  source: "reflection"
  relatesTo: { taskId: string; stepIds: string[] }
}

export interface Reflection {
  taskId: string
  outcome: ReflectionOutcome
  evaluations: Evaluation[]
  corrections: CorrectionProposal[]
  lessons: Lesson[]
  summary: string
}

export interface ReflectInput {
  runResult: RunResult
  evaluations: Evaluation[]
}
