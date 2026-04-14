export type MemoryKind =
  | "fact"
  | "decision"
  | "lesson"
  | "preference"
  | "fragment"
  | "conversation"
  | (string & {})

export interface MemoryItem {
  id: string
  kind: MemoryKind
  content: string
  embedding?: number[]
  tags: string[]
  meta?: Record<string, string>
  pinned?: boolean
  createdAt: number
  lastUsedAt: number
  useCount: number
}

export type EpisodeOutcome = "success" | "failure" | "partial" | "aborted"

export interface Episode {
  id: string
  taskId: string
  outcome: EpisodeOutcome
  content: string
  at: number
  durationMs?: number
  meta?: Record<string, string>
  agentId?: string
  sessionId?: string
}

export interface RecallQuery {
  text: string
  tags?: string[]
  kinds?: MemoryKind[]
  limit?: number
  minScore?: number
}

export interface SearchQuery {
  text?: string
  tags?: string[]
  kinds?: MemoryKind[]
  limit?: number
  since?: number
}

export interface RecallHit {
  item: MemoryItem
  score: number
}
