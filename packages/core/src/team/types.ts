import type { CliId } from "../bridge/types.ts"

export type RoleId =
  | "pm"
  | "architect"
  | "coordinator"
  | "backend"
  | "frontend"
  | "data"
  | "qa"
  | "sre"
  | "security"
  | "doc"
  | "research"
  | "reviewer"
  | "learning"

export interface RoleDefinition {
  id: RoleId
  name: string
  description: string
  cliPreference: CliId[]
  skills: string[]
  budgetShare: number
  tier: "executor" | "advisor" | "fallback"
}

export interface TeamMember {
  role: RoleId
  definition: RoleDefinition
  cli: CliId
  budgetShare: number
}

export interface ProjectSpec {
  id: string
  name: string
  techStack: string[]
  hasDesignPhase?: boolean
  hasDatabaseChanges?: boolean
  riskClass?: "low" | "medium" | "high" | "critical"
  isReleaseTarget?: boolean
  publicFacing?: boolean
  usesNewTech?: boolean
  totalBudgetUsd?: number
  totalTokenBudget?: number
  deadline?: string
}

export interface Team {
  project: ProjectSpec
  members: TeamMember[]
  totalBudgetUsd: number
  totalTokenBudget: number
}

export type CollaborationMode = "debate" | "collab" | "cooperate" | "delegate"

export interface Interaction {
  mode: CollaborationMode
  from: RoleId
  to: RoleId | RoleId[]
  topic: string
  payload?: unknown
  at: number
}
