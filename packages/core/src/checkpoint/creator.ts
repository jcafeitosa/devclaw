import { defaultGitRunner, type GitRunner, mustRun } from "./git.ts"
import type { CheckpointStore } from "./store.ts"
import type { Checkpoint, CheckpointTrigger } from "./types.ts"

export interface CheckpointCreatorConfig {
  store: CheckpointStore
  cwd?: string
  git?: GitRunner
  refPrefix?: string
}

export interface CreateCheckpointOptions {
  name?: string
  trigger?: CheckpointTrigger
  taskId?: string
  pinned?: boolean
  meta?: Record<string, string>
}

function generateId(name: string): string {
  return `ck_${Date.now()}_${Math.floor(Math.random() * 1e6)}_${name.replace(/\W+/g, "-")}`
}

export class CheckpointCreator {
  private readonly store: CheckpointStore
  private readonly cwd?: string
  private readonly git: GitRunner
  private readonly refPrefix: string

  constructor(cfg: CheckpointCreatorConfig) {
    this.store = cfg.store
    this.cwd = cfg.cwd
    this.git = cfg.git ?? defaultGitRunner
    this.refPrefix = cfg.refPrefix ?? "refs/devclaw/checkpoints"
  }

  async create(opts: CreateCheckpointOptions = {}): Promise<Checkpoint> {
    const name = opts.name ?? `auto_${new Date().toISOString().replace(/[:.]/g, "-")}`
    const trigger = opts.trigger ?? "manual"
    const id = generateId(name)
    const runOpts = { cwd: this.cwd }

    // Stage everything (including untracked) and create a stash object
    await mustRun(this.git, ["add", "-A"], runOpts)
    const sha = await mustRun(this.git, ["stash", "create", `checkpoint:${name}`], runOpts)
    if (!sha) {
      // Nothing to stash (clean tree) — fall back to HEAD
      const head = await mustRun(this.git, ["rev-parse", "HEAD"], runOpts)
      const ref = `${this.refPrefix}/${id}`
      await mustRun(this.git, ["update-ref", ref, head], runOpts)
      const cp: Checkpoint = {
        id,
        name,
        sha: head,
        trigger,
        createdAt: Date.now(),
        pinned: opts.pinned,
        taskId: opts.taskId,
        meta: { ...(opts.meta ?? {}), empty: "true" },
      }
      await this.store.save(cp)
      return cp
    }

    const ref = `${this.refPrefix}/${id}`
    await mustRun(this.git, ["update-ref", ref, sha], runOpts)
    const cp: Checkpoint = {
      id,
      name,
      sha,
      trigger,
      createdAt: Date.now(),
      pinned: opts.pinned,
      taskId: opts.taskId,
      meta: opts.meta,
    }
    await this.store.save(cp)
    return cp
  }
}
