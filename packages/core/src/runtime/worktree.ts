import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WorktreeProvisionError } from "./errors.ts"
import { LocalRuntime } from "./local.ts"
import type { ManagedRuntime, RuntimeResult, RuntimeSpec } from "./types.ts"

export type RuntimeGitRunner = (
  cmd: string[],
  opts?: { cwd?: string },
) => Promise<{ exitCode: number; stderr: string }>

export interface WorktreeRuntimeConfig {
  repoRoot: string
  baseRef?: string
  prefix?: string
  git?: RuntimeGitRunner
}

async function defaultGit(
  cmd: string[],
  opts: { cwd?: string } = {},
): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(["git", ...cmd], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [_stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { exitCode, stderr }
}

export class WorktreeRuntime implements ManagedRuntime {
  readonly kind = "worktree"
  private readonly local = new LocalRuntime()
  private readonly git: RuntimeGitRunner

  constructor(private readonly cfg: WorktreeRuntimeConfig) {
    this.git = cfg.git ?? defaultGit
  }

  async run(spec: RuntimeSpec): Promise<RuntimeResult> {
    const prefix = this.cfg.prefix ?? "devclaw-wt-"
    const parentRaw = await mkdtemp(join(tmpdir(), prefix))
    const parent = await realpath(parentRaw)
    const workdir = join(parent, "w")
    const baseRef = this.cfg.baseRef ?? "HEAD"
    const branch = `devclaw-rt/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const add = await this.git(["worktree", "add", "-b", branch, workdir, baseRef], {
      cwd: this.cfg.repoRoot,
    })
    if (add.exitCode !== 0) {
      await rm(parent, { recursive: true, force: true })
      throw new WorktreeProvisionError(add.stderr || "git worktree add failed")
    }
    try {
      return await this.local.run({ ...spec, cwd: workdir })
    } finally {
      try {
        await this.git(["worktree", "remove", "--force", workdir], { cwd: this.cfg.repoRoot })
      } catch {
        // best-effort
      }
      try {
        await this.git(["branch", "-D", branch], { cwd: this.cfg.repoRoot })
      } catch {
        // best-effort
      }
      await rm(parent, { recursive: true, force: true })
    }
  }
}
