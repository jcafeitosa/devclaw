export type WorkKind =
  | "workspace"
  | "portfolio"
  | "project"
  | "epic"
  | "task"
  | "subtask"
  | "ticket"
  | "milestone"
  | "sprint"

export type WorkStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled"

export type Priority = "low" | "normal" | "high" | "urgent"

export interface WorkItem {
  id: string
  kind: WorkKind
  title: string
  description?: string
  status: WorkStatus
  priority: Priority
  parentId?: string
  owner?: string
  assignees?: string[]
  tags?: string[]
  createdAt: number
  updatedAt: number
  dueAt?: number
  startAt?: number
  estimateMs?: number
  actualMs?: number
  meta?: Record<string, string>
}

export type DependencyType =
  | "blocked_by"
  | "blocks"
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "related_to"
  | "parent_of"
  | "child_of"
  | "duplicate_of"

export interface Dependency {
  id: string
  from: string
  to: string
  type: DependencyType
  createdAt: number
  external?: boolean
  meta?: Record<string, string>
}

export interface CriticalPathResult {
  items: string[]
  totalMs: number
  slack: Map<string, number>
}

export interface ListFilter {
  kind?: WorkKind[]
  status?: WorkStatus[]
  owner?: string
  tag?: string
  parentId?: string
}

export interface KanbanColumn {
  key: string
  items: WorkItem[]
}

export interface KanbanView {
  field: "status" | "priority" | "owner" | "kind"
  columns: KanbanColumn[]
}

export interface GanttBar {
  id: string
  title: string
  startAt: number
  endAt: number
  onCriticalPath: boolean
}

export interface GanttView {
  now: number
  bars: GanttBar[]
  critical: string[]
}
