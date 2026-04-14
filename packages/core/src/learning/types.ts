export type CapsuleType = "individual" | "team"

export interface Triplet {
  instinct: string
  experience: string
  skill: string
}

export interface Observation {
  at: number
  event: string
  data?: Record<string, unknown>
}

export interface CapsuleFeedback {
  applications: number
  successes: number
  failures: number
  averageScore: number | null
  scores: number[]
}

export interface CapsuleMetadata {
  tags: string[]
  toolsUsed: string[]
  skillsUsed: string[]
  durationMs: number
  tokens: number
  costUsd: number
}

export interface IndividualCapsule {
  id: string
  type: "individual"
  version: string
  createdAt: number
  updatedAt: number
  domain: string
  agent: { id: string; model?: string }
  taskContext?: Record<string, string>
  triplet: Triplet
  observations: Observation[]
  metadata: CapsuleMetadata
  feedback: CapsuleFeedback
  pinned?: boolean
  source?: string
}

export interface TeamPhase {
  name: string
  leadRole: string
  participants: string[]
  durationMs: number
  decisions: string[]
}

export interface TeamTopology {
  role: string
  agentId: string
  weight: number
}

export interface TeamCollaborationMessage {
  from: string
  to: string
  message: string
  type: "handoff" | "review" | "debate"
  at: number
}

export interface TeamCapsule {
  id: string
  type: "team"
  version: string
  createdAt: number
  updatedAt: number
  domain: string
  topology: TeamTopology[]
  handoffPattern: "sequential" | "parallel" | "hub-and-spoke" | (string & {})
  phases: TeamPhase[]
  collaborationTrace: TeamCollaborationMessage[]
  sharedContext?: Record<string, unknown>
  outcomes: {
    success: boolean
    tasksCompleted: number
    reworkRate: number
    totalCostUsd: number
    totalDurationMs: number
  }
  lessons: string[]
  feedback: CapsuleFeedback
  pinned?: boolean
  source?: string
}

export type Capsule = IndividualCapsule | TeamCapsule

export interface PolicyRule {
  id: string
  description: string
  match: (input: PolicyInput) => boolean
  actions: PolicyAction[]
  sourceCapsuleId?: string
  enabled?: boolean
}

export interface PolicyInput {
  domain?: string
  tags?: string[]
  meta?: Record<string, string>
}

export interface PolicyAction {
  kind:
    | "inject-context"
    | "prefer-skill"
    | "avoid-tool"
    | "require-review"
    | "annotate"
    | (string & {})
  payload?: Record<string, string>
  description?: string
}

export interface ApplyBundle {
  capsuleId: string
  instinct: string
  experienceText: string
  skillHint: string
  tags: string[]
  toolsUsed: string[]
}
