import type { Episode, EpisodeOutcome } from "./types.ts"

export interface EpisodeQuery {
  taskId?: string
  outcome?: EpisodeOutcome
  since?: number
  until?: number
  limit?: number
  agentId?: string
}

export interface EpisodicMemory {
  append(episode: Episode): Promise<void>
  all(): Promise<Episode[]>
  query(q: EpisodeQuery): Promise<Episode[]>
}

export class InMemoryEpisodic implements EpisodicMemory {
  private log: Episode[] = []

  async append(episode: Episode): Promise<void> {
    this.log.push({ ...episode })
  }

  async all(): Promise<Episode[]> {
    return this.log.map((e) => ({ ...e }))
  }

  async query(q: EpisodeQuery): Promise<Episode[]> {
    const filtered = this.log.filter((e) => {
      if (q.taskId && e.taskId !== q.taskId) return false
      if (q.outcome && e.outcome !== q.outcome) return false
      if (q.agentId && e.agentId !== q.agentId) return false
      if (q.since !== undefined && e.at < q.since) return false
      if (q.until !== undefined && e.at > q.until) return false
      return true
    })
    filtered.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    return filtered.slice(0, q.limit ?? 100).map((e) => ({ ...e }))
  }
}
