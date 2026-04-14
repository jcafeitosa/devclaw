import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { IsolationFailedError } from "../errors.ts"
import type { Allocation } from "../types.ts"
import type { IsolationProvider } from "./none.ts"

export interface WorktreeIsolationConfig {
  repoRoot: string
  baseRef?: string
  prefix?: string
  git?: (cmd: string[], opts?: { cwd?: string }) => Promise<{ exitCode: number; stderr: string }>
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

export class WorktreeIsolation implements IsolationProvider {
  readonly mode = "worktree"
  private readonly git: NonNullable<WorktreeIsolationConfig["git"]>

  constructor(private readonly cfg: WorktreeIsolationConfig) {
    this.git = cfg.git ?? defaultGit
  }

  async allocate({ subagentId }: { subagentId: string; cwd?: string }): Promise<Allocation> {
    const prefix = this.cfg.prefix ?? "devclaw-worktree-"
    const parent = await mkdtemp(join(tmpdir(), `${prefix}${subagentId}-`))
    const workdir = join(parent, "w")
    const baseRef = this.cfg.baseRef ?? "HEAD"
    const branch = `devclaw-sub/${subagentId}-${Date.now()}`
    const add = await this.git(["worktree", "add", "-b", branch, workdir, baseRef], {
      cwd: this.cfg.repoRoot,
    })
    if (add.exitCode !== 0) {
      await rm(parent, { recursive: true, force: true })
      throw new IsolationFailedError(subagentId, new Error(add.stderr || "git worktree add failed"))
    }
    const self = this
    return {
      workdir,
      async cleanup() {
        try {
          await self.git(["worktree", "remove", "--force", workdir], {
            cwd: self.cfg.repoRoot,
          })
        } catch {
          // best-effort
        }
        try {
          await self.git(["branch", "-D", branch], { cwd: self.cfg.repoRoot })
        } catch {
          // best-effort
        }
        await rm(parent, { recursive: true, force: true })
      },
    }
  }
}
