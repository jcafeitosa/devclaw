import { ChatRewind } from "./chat_rewind.ts"
import {
  CheckpointCreator,
  type CheckpointCreatorConfig,
  type CreateCheckpointOptions,
} from "./creator.ts"
import {
  CheckpointRestorer,
  type CheckpointRestorerConfig,
  type RestoreOptions,
} from "./restorer.ts"
import { type CheckpointStore, InMemoryCheckpointStore } from "./store.ts"
import type { Checkpoint, RetentionPolicy } from "./types.ts"
import { DEFAULT_RETENTION } from "./types.ts"

export interface CheckpointManagerConfig {
  store?: CheckpointStore
  creator?: Omit<CheckpointCreatorConfig, "store">
  restorer?: Omit<CheckpointRestorerConfig, "store">
  retention?: RetentionPolicy
  chatRewind?: ChatRewind
}

export class CheckpointManager {
  readonly store: CheckpointStore
  readonly chatRewind: ChatRewind
  readonly retention: RetentionPolicy
  private readonly creator: CheckpointCreator
  private readonly restorer: CheckpointRestorer

  constructor(cfg: CheckpointManagerConfig = {}) {
    this.store = cfg.store ?? new InMemoryCheckpointStore()
    this.retention = cfg.retention ?? DEFAULT_RETENTION
    this.chatRewind = cfg.chatRewind ?? new ChatRewind()
    this.creator = new CheckpointCreator({ store: this.store, ...(cfg.creator ?? {}) })
    this.restorer = new CheckpointRestorer({ store: this.store, ...(cfg.restorer ?? {}) })
  }

  async create(opts?: CreateCheckpointOptions): Promise<Checkpoint> {
    const cp = await this.creator.create(opts)
    await this.prune()
    return cp
  }

  async restore(id: string, opts?: RestoreOptions) {
    return this.restorer.restore(id, opts)
  }

  async verify(id: string): Promise<boolean> {
    return this.restorer.verify(id)
  }

  async prune(): Promise<{ cold: string[]; purged: string[] }> {
    return this.store.prune(this.retention)
  }

  async list(): Promise<Checkpoint[]> {
    return this.store.list()
  }
}
