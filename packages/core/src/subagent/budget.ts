import { BudgetExceededError } from "./errors.ts"
import type { SubagentRestrictions } from "./types.ts"

export interface BudgetSample {
  costUsd?: number
  tokens?: number
}

export class BudgetGuard {
  private readonly startedAt: number
  private costUsd = 0
  private tokens = 0

  constructor(
    private readonly subagentId: string,
    private readonly restrictions: SubagentRestrictions = {},
  ) {
    this.startedAt = performance.now()
  }

  add(sample: BudgetSample): void {
    if (sample.costUsd) this.costUsd += sample.costUsd
    if (sample.tokens) this.tokens += sample.tokens
    this.enforce()
  }

  enforce(): void {
    const { maxDurationMs, maxCostUsd, budgetTokens } = this.restrictions
    if (maxDurationMs !== undefined) {
      const ms = performance.now() - this.startedAt
      if (ms > maxDurationMs) {
        throw new BudgetExceededError(this.subagentId, "duration", ms, maxDurationMs)
      }
    }
    if (maxCostUsd !== undefined && this.costUsd > maxCostUsd) {
      throw new BudgetExceededError(this.subagentId, "cost", this.costUsd, maxCostUsd)
    }
    if (budgetTokens !== undefined && this.tokens > budgetTokens) {
      throw new BudgetExceededError(this.subagentId, "tokens", this.tokens, budgetTokens)
    }
  }

  snapshot(): { durationMs: number; costUsd: number; tokens: number } {
    return {
      durationMs: performance.now() - this.startedAt,
      costUsd: this.costUsd,
      tokens: this.tokens,
    }
  }
}
