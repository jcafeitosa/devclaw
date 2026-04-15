import type { CostEntry, CostTracker } from "./tracker.ts"

export type BudgetScope = "task" | "session" | "day"

export interface BudgetLimits {
  taskUsd?: number
  sessionUsd?: number
  dayUsd?: number
}

export const DEFAULT_BUDGET_LIMITS: Required<BudgetLimits> = {
  taskUsd: 0.15,
  sessionUsd: 2,
  dayUsd: 10,
}

export interface BudgetWarning {
  scope: BudgetScope
  id: string
  limit: number
  current: number
  utilization: number
  threshold: number
}

export interface BudgetRecordInput {
  taskId?: string
  sessionId?: string
  usd: number
  at: number
}

export interface BudgetEnforcerConfig {
  limits: BudgetLimits
  warningThresholds?: readonly number[]
  onWarn?: (warning: BudgetWarning) => void
  now?: () => number
}

export interface BudgetUsage {
  taskUsd: Record<string, number>
  sessionUsd: Record<string, number>
  dayUsd: number
  dayStart: number
}

export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED" as const
  readonly recoverable = false
  readonly scope: BudgetScope
  readonly id: string
  readonly limit: number
  readonly current: number
  readonly planned: number

  constructor(scope: BudgetScope, id: string, limit: number, current: number, planned: number) {
    super(
      `budget exceeded: ${scope}='${id}' current=$${current.toFixed(4)} + planned=$${planned.toFixed(4)} > limit=$${limit.toFixed(2)}`,
    )
    this.name = "BudgetExceededError"
    this.scope = scope
    this.id = id
    this.limit = limit
    this.current = current
    this.planned = planned
  }
}

const DEFAULT_THRESHOLDS = [0.8, 0.95] as const

function dayStartMs(timestamp: number): number {
  const d = new Date(timestamp)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime()
}

export class BudgetEnforcer {
  private readonly limits: BudgetLimits
  private readonly warningThresholds: readonly number[]
  private readonly onWarn?: (warning: BudgetWarning) => void
  private readonly now: () => number
  private taskUsd = new Map<string, number>()
  private sessionUsd = new Map<string, number>()
  private dayUsd = 0
  private dayStart = 0
  private readonly firedWarnings = new Set<string>()

  constructor(cfg: BudgetEnforcerConfig) {
    this.limits = cfg.limits
    this.warningThresholds = cfg.warningThresholds ?? DEFAULT_THRESHOLDS
    this.onWarn = cfg.onWarn
    this.now = cfg.now ?? Date.now
    this.dayStart = dayStartMs(this.now())
  }

  limitsSnapshot(): BudgetLimits {
    return { ...this.limits }
  }

  attachTo(tracker: CostTracker): void {
    tracker.on((entry: CostEntry) => {
      this.record({
        taskId: entry.taskId,
        sessionId: entry.meta?.sessionId,
        usd: entry.usd,
        at: entry.at,
      })
    })
  }

  record(input: BudgetRecordInput): void {
    this.rolloverIfNeeded(this.now())
    if (input.taskId) {
      const next = (this.taskUsd.get(input.taskId) ?? 0) + input.usd
      this.taskUsd.set(input.taskId, next)
      this.maybeWarn("task", input.taskId, next, this.limits.taskUsd)
    }
    if (input.sessionId) {
      const next = (this.sessionUsd.get(input.sessionId) ?? 0) + input.usd
      this.sessionUsd.set(input.sessionId, next)
      this.maybeWarn("session", input.sessionId, next, this.limits.sessionUsd)
    }
    this.dayUsd += input.usd
    this.maybeWarn("day", this.dayKey(), this.dayUsd, this.limits.dayUsd)
  }

  check(ctx: { taskId?: string; sessionId?: string }, plannedUsd: number): void {
    this.rolloverIfNeeded(this.now())
    const epsilon = 1e-9
    if (this.limits.taskUsd !== undefined && ctx.taskId) {
      const current = this.taskUsd.get(ctx.taskId) ?? 0
      if (current + plannedUsd > this.limits.taskUsd + epsilon) {
        throw new BudgetExceededError("task", ctx.taskId, this.limits.taskUsd, current, plannedUsd)
      }
    }
    if (this.limits.sessionUsd !== undefined && ctx.sessionId) {
      const current = this.sessionUsd.get(ctx.sessionId) ?? 0
      if (current + plannedUsd > this.limits.sessionUsd + epsilon) {
        throw new BudgetExceededError(
          "session",
          ctx.sessionId,
          this.limits.sessionUsd,
          current,
          plannedUsd,
        )
      }
    }
    if (this.limits.dayUsd !== undefined) {
      if (this.dayUsd + plannedUsd > this.limits.dayUsd + epsilon) {
        throw new BudgetExceededError(
          "day",
          this.dayKey(),
          this.limits.dayUsd,
          this.dayUsd,
          plannedUsd,
        )
      }
    }
  }

  usage(): BudgetUsage {
    this.rolloverIfNeeded(this.now())
    return {
      taskUsd: Object.fromEntries(this.taskUsd),
      sessionUsd: Object.fromEntries(this.sessionUsd),
      dayUsd: this.dayUsd,
      dayStart: this.dayStart,
    }
  }

  reset(): void {
    this.taskUsd.clear()
    this.sessionUsd.clear()
    this.dayUsd = 0
    this.firedWarnings.clear()
    this.dayStart = dayStartMs(this.now())
  }

  private rolloverIfNeeded(atMs: number): void {
    const currentDay = dayStartMs(atMs)
    if (currentDay <= this.dayStart) return
    this.dayStart = currentDay
    this.dayUsd = 0
    for (const key of [...this.firedWarnings]) {
      if (key.startsWith("day:")) this.firedWarnings.delete(key)
    }
  }

  private dayKey(): string {
    return new Date(this.dayStart).toISOString().slice(0, 10)
  }

  private maybeWarn(scope: BudgetScope, id: string, current: number, limit?: number): void {
    if (!limit || !this.onWarn) return
    const utilization = current / limit
    for (const threshold of this.warningThresholds) {
      if (utilization < threshold) continue
      const key = `${scope}:${id}:${threshold}`
      if (this.firedWarnings.has(key)) continue
      this.firedWarnings.add(key)
      this.onWarn({ scope, id, limit, current, utilization, threshold })
    }
  }
}

export function makeDefaultBudgetEnforcer(
  cfg: Omit<BudgetEnforcerConfig, "limits"> = {},
): BudgetEnforcer {
  return new BudgetEnforcer({
    limits: { ...DEFAULT_BUDGET_LIMITS },
    ...cfg,
  })
}
