import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Allocation } from "../types.ts"
import type { IsolationProvider } from "./none.ts"

export interface ForkIsolationConfig {
  env?: Record<string, string>
  prefix?: string
}

export class ForkIsolation implements IsolationProvider {
  readonly mode = "fork"
  constructor(private readonly cfg: ForkIsolationConfig = {}) {}

  async allocate({ subagentId }: { subagentId: string; cwd?: string }): Promise<Allocation> {
    const prefix = this.cfg.prefix ?? "devclaw-fork-"
    const workdir = await mkdtemp(join(tmpdir(), `${prefix}${subagentId}-`))
    return {
      workdir,
      env: this.cfg.env,
      async cleanup() {
        await rm(workdir, { recursive: true, force: true })
      },
    }
  }
}
