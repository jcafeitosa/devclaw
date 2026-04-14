import type { StepContext } from "./types.ts"

export interface StepExecutor {
  execute(ctx: StepContext): Promise<{ output: unknown }>
}
