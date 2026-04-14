export type ApprovalGateKind =
  | "architectural"
  | "security"
  | "financial"
  | "release"
  | "data"
  | "plugin-install"
  | "policy-change"
  | (string & {})

export type ApprovalStatus = "pending" | "approved" | "denied" | "overridden"

export interface GovernanceApprovalRequest {
  id: string
  gate: ApprovalGateKind
  requestedBy: string
  summary: string
  rationale?: string
  metadata?: Record<string, string>
  createdAt: number
}

export interface ApprovalDecision {
  requestId: string
  status: ApprovalStatus
  approver: string
  reason?: string
  decidedAt: number
}

export interface OverrideRecord {
  requestId: string
  actor: string
  rationale: string
  acknowledgedRisk: boolean
  at: number
}

export type BudgetScopeKind = "company" | "project" | "sprint" | "agent" | "task"

export interface BudgetLimit {
  softUsd?: number
  hardUsd?: number
  tokens?: number
}

export interface BudgetScope {
  id: string
  kind: BudgetScopeKind
  parentId?: string
  limit: BudgetLimit
}

export interface BudgetCharge {
  costUsd: number
  tokens?: number
  description?: string
}

export type GoalKind = "mission" | "objective" | "project" | "epic" | "task" | "ticket"

export interface GoalNode {
  id: string
  kind: GoalKind
  title: string
  parentId?: string
  priority?: number
  risk?: "low" | "medium" | "high" | "critical"
  owner?: string
  createdAt: number
}

export type OrgRole = "ceo" | "cto" | "coo" | "cfo" | "coordinator" | "specialist" | "worker"

export interface OrgMember {
  id: string
  role: OrgRole
  managerId?: string
}

export interface Ownership {
  itemId: string
  ownerId: string
}
