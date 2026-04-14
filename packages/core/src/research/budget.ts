import { ResearchBudgetExceededError } from "./errors.ts"

export interface ResearchBudgetConfig {
  maxCallsPerTask?: number
}

export class ResearchBudget {
  private readonly max: number
  private used = 0

  constructor(cfg: ResearchBudgetConfig = {}) {
    this.max = cfg.maxCallsPerTask ?? 5
  }

  canCall(): boolean {
    return this.used < this.max
  }

  consume(): number {
    if (!this.canCall()) {
      throw new ResearchBudgetExceededError(this.max, this.used + 1)
    }
    this.used++
    return this.used
  }

  snapshot(): { used: number; max: number; remaining: number } {
    return { used: this.used, max: this.max, remaining: Math.max(0, this.max - this.used) }
  }
}
