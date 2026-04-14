export type Tier = "executor" | "advisor" | "fallback"

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped"

export interface Step {
  id: string
  description: string
  tier?: Tier
  priority?: number
  dependsOn?: string[]
  tool?: string
  toolInput?: unknown
  expectedOutput?: string
  meta?: Record<string, string>
}

export interface StepState {
  id: string
  status: StepStatus
  output?: unknown
  error?: string
  startedAt?: number
  completedAt?: number
  provider?: string
  model?: string
}

export interface Plan {
  goal: string
  steps: Step[]
  createdAt: number
  meta?: Record<string, string>
}

export interface Task {
  goal: string
  expectedOutput: string
  sessionId?: string
  agentId?: string
  hints?: string[]
  maxSteps?: number
  deadlineMs?: number
}

export interface RouteChoice {
  tier: Tier
  providerId: string
  model?: string
}

export interface RunResult {
  plan: Plan
  states: StepState[]
  episodes: string[]
  completed: boolean
  reason?: "done" | "max_steps" | "deadline" | "step_failed"
}

export interface StepContext {
  task: Task
  plan: Plan
  step: Step
  route: RouteChoice
  priorStates: StepState[]
}
