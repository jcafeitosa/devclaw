import type { GitRunner } from "./git.ts"
import { defaultGitRunner, mustRun } from "./git.ts"
import type { CheckpointStore } from "./store.ts"
import type { Checkpoint } from "./types.ts"

export interface CheckpointRestorerConfig {
  store: CheckpointStore
  cwd?: string
  git?: GitRunner
}

export interface RestoreOptions {
  mode?: "apply" | "reset"
}

export interface RestoreResult {
  checkpoint: Checkpoint
  applied: boolean
  mode: "apply" | "reset"
}

export class CheckpointRestorer {
  private readonly store: CheckpointStore
  private readonly cwd?: string
  private readonly git: GitRunner

  constructor(cfg: CheckpointRestorerConfig) {
    this.store = cfg.store
    this.cwd = cfg.cwd
    this.git = cfg.git ?? defaultGitRunner
  }

  async restore(id: string, opts: RestoreOptions = {}): Promise<RestoreResult> {
    const checkpoint = await this.store.get(id)
    const mode = opts.mode ?? "apply"
    const runOpts = { cwd: this.cwd }
    if (mode === "apply") {
      await mustRun(this.git, ["stash", "apply", "--index", checkpoint.sha], runOpts)
    } else {
      await mustRun(this.git, ["reset", "--hard", checkpoint.sha], runOpts)
    }
    return { checkpoint, applied: true, mode }
  }

  async verify(id: string): Promise<boolean> {
    const checkpoint = await this.store.get(id)
    const res = await this.git(["cat-file", "-t", checkpoint.sha], { cwd: this.cwd })
    return res.exitCode === 0
  }
}
