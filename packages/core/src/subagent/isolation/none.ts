import type { Allocation } from "../types.ts"

export interface IsolationProvider {
  readonly mode: string
  allocate(opts: { subagentId: string; cwd?: string }): Promise<Allocation>
}

export class NoneIsolation implements IsolationProvider {
  readonly mode = "none"
  async allocate({ cwd }: { subagentId: string; cwd?: string }): Promise<Allocation> {
    return {
      workdir: cwd ?? process.cwd(),
      async cleanup() {
        // no-op
      },
    }
  }
}
