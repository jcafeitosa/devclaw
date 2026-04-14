export type SourceTier =
  | "official-docs"
  | "github"
  | "stackoverflow"
  | "blog"
  | "paper"
  | "search"
  | "llm"

export const AUTHORITY_RANK: Record<SourceTier, number> = {
  "official-docs": 7,
  github: 6,
  stackoverflow: 5,
  blog: 4,
  paper: 3,
  search: 2,
  llm: 1,
}

export interface Document {
  id: string
  sourceId: string
  tier: SourceTier
  url?: string
  title: string
  content: string
  publishedAt?: number
  fetchedAt: number
  tags?: string[]
}

export interface Chunk {
  id: string
  documentId: string
  content: string
  tokenEstimate: number
  position: number
}

export interface Query {
  text: string
  tags?: string[]
  tiers?: SourceTier[]
  limit?: number
  minScore?: number
}

export interface Citation {
  id: string
  documentId: string
  title: string
  url?: string
  tier: SourceTier
  snippet: string
}

export interface ResearchAnswer {
  query: string
  summary: string
  citations: Citation[]
  fromCache: boolean
  durationMs: number
}

export interface FreshnessPolicy {
  ttlByTier: Partial<Record<SourceTier, number>>
}

export const DEFAULT_TTL: Required<FreshnessPolicy>["ttlByTier"] = {
  "official-docs": 7 * 24 * 60 * 60 * 1000,
  github: 24 * 60 * 60 * 1000,
  stackoverflow: 30 * 24 * 60 * 60 * 1000,
  blog: 30 * 24 * 60 * 60 * 1000,
  paper: Number.POSITIVE_INFINITY,
  search: 24 * 60 * 60 * 1000,
  llm: 60 * 60 * 1000,
}
