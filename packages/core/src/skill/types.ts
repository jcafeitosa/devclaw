export type SkillStatus = "draft" | "review" | "active" | "deprecated" | "archived"

export type SkillInputType = "string" | "number" | "boolean" | "object" | "array"

export interface SkillInputSpec {
  name: string
  type: SkillInputType
  required?: boolean
  describe?: string
}

export interface SkillConstraints {
  maxValueUsd?: number
  requiresApproval?: boolean
  maxDurationMs?: number
  tools?: string[]
}

export interface Skill {
  id: string
  version: string
  status: SkillStatus
  description: string
  body: string
  tags: string[]
  triggers: string[]
  inputs: SkillInputSpec[]
  steps: string[]
  contextRequirements: string[]
  tools: string[]
  constraints?: SkillConstraints
  outputSchema?: Record<string, unknown>
  author?: string
  source?: string
  updatedAt: number
}

export interface SkillMetadata
  extends Pick<
    Skill,
    "id" | "version" | "status" | "description" | "tags" | "triggers" | "source" | "updatedAt"
  > {}

export interface ActivationMatch {
  skill: SkillMetadata
  score: number
  reasons: string[]
}
