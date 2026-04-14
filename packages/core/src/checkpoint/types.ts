export type CheckpointTrigger =
  | "manual"
  | "pre-destructive-tool"
  | "pre-bulk-ops"
  | "pre-git-force"
  | "pre-rebase"
  | "pre-migration"
  | "pre-deploy"
  | "subagent-none-isolation"
  | "deep-loop-round"
  | (string & {})

export interface Checkpoint {
  id: string
  name: string
  sha: string
  trigger: CheckpointTrigger
  createdAt: number
  pinned?: boolean
  taskId?: string
  meta?: Record<string, string>
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  at: number
  checkpointId?: string
  meta?: Record<string, string>
}

export interface RewindArchive {
  id: string
  rewindPointId: string
  messages: ChatMessage[]
  archivedAt: number
}

export interface RetentionPolicy {
  hotLimit: number
  coldLimit: number
  pinnedAlwaysKept: boolean
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  hotLimit: 50,
  coldLimit: 200,
  pinnedAlwaysKept: true,
}
