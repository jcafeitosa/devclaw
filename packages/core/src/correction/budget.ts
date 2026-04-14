import { CorrectionBudgetExceededError } from "./errors.ts"

export interface CorrectionBudgetConfig {
  maxAttempts?: number
  maxCostUsd?: number
  maxDurationMs?: number
  originalCostUsd?: number
  costMultiplier?: number
}

export interface CorrectionBudgetSample {
  costUsd?: number
  tokens?: number
}

export class CorrectionBudget {
  readonly maxAttempts: number
  readonly maxCostUsd: number
  readonly maxDurationMs: number
  private readonly startedAt = performance.now()
  private attempts = 0
  private costUsd = 0
  private tokens = 0

  constructor(cfg: CorrectionBudgetConfig = {}) {
    this.maxAttempts = cfg.maxAttempts ?? 3
    this.maxCostUsd = cfg.maxCostUsd ?? (cfg.originalCostUsd ?? 0.1) * (cfg.costMultiplier ?? 10)
    this.maxDurationMs = cfg.maxDurationMs ?? 30 * 60 * 1000
  }

  canAttempt(): boolean {
    return (
      this.attempts < this.maxAttempts &&
      this.costUsd <= this.maxCostUsd &&
      performance.now() - this.startedAt <= this.maxDurationMs
    )
  }

  startAttempt(): number {
    if (!this.canAttempt()) {
      if (this.attempts >= this.maxAttempts) {
        throw new CorrectionBudgetExceededError("attempts", this.attempts, this.maxAttempts)
      }
      if (this.costUsd > this.maxCostUsd) {
        throw new CorrectionBudgetExceededError("cost", this.costUsd, this.maxCostUsd)
      }
      throw new CorrectionBudgetExceededError(
        "duration",
        performance.now() - this.startedAt,
        this.maxDurationMs,
      )
    }
    this.attempts++
    return this.attempts
  }

  record(sample: CorrectionBudgetSample): void {
    if (sample.costUsd) this.costUsd += sample.costUsd
    if (sample.tokens) this.tokens += sample.tokens
  }

  snapshot(): { attempts: number; costUsd: number; tokens: number; durationMs: number } {
    return {
      attempts: this.attempts,
      costUsd: this.costUsd,
      tokens: this.tokens,
      durationMs: performance.now() - this.startedAt,
    }
  }
}
