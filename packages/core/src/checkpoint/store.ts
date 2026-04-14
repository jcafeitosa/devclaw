import { CheckpointNotFoundError } from "./errors.ts"
import { type Checkpoint, DEFAULT_RETENTION, type RetentionPolicy } from "./types.ts"

export interface CheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>
  get(id: string): Promise<Checkpoint>
  list(): Promise<Checkpoint[]>
  delete(id: string): Promise<void>
  prune(policy?: RetentionPolicy): Promise<{ cold: string[]; purged: string[] }>
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly map = new Map<string, Checkpoint>()
  private readonly coldSet = new Set<string>()

  async save(checkpoint: Checkpoint): Promise<void> {
    this.map.set(checkpoint.id, { ...checkpoint })
    this.coldSet.delete(checkpoint.id)
  }

  async get(id: string): Promise<Checkpoint> {
    const c = this.map.get(id)
    if (!c) throw new CheckpointNotFoundError(id)
    return { ...c }
  }

  async list(): Promise<Checkpoint[]> {
    return [...this.map.values()].map((c) => ({ ...c })).sort((a, b) => b.createdAt - a.createdAt)
  }

  async delete(id: string): Promise<void> {
    this.map.delete(id)
    this.coldSet.delete(id)
  }

  isCold(id: string): boolean {
    return this.coldSet.has(id)
  }

  async prune(policy: RetentionPolicy = DEFAULT_RETENTION): Promise<{
    cold: string[]
    purged: string[]
  }> {
    const sorted = [...this.map.values()]
      .filter((c) => !(policy.pinnedAlwaysKept && c.pinned))
      .sort((a, b) => b.createdAt - a.createdAt)
    const cold: string[] = []
    const purged: string[] = []
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i]!
      if (i < policy.hotLimit) {
        this.coldSet.delete(item.id)
        continue
      }
      if (i < policy.coldLimit) {
        if (!this.coldSet.has(item.id)) {
          this.coldSet.add(item.id)
          cold.push(item.id)
        }
        continue
      }
      this.map.delete(item.id)
      this.coldSet.delete(item.id)
      purged.push(item.id)
    }
    return { cold, purged }
  }
}
