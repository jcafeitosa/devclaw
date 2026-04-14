import { computeUsdCost, type RateCardRegistry, type TokenUsage } from "./ratecard.ts"

export interface CostRecordSpec {
  provider: string
  model: string
  usage: TokenUsage
  taskId?: string
  agentId?: string
  meta?: Record<string, string>
}

export interface CostEntry {
  at: number
  provider: string
  model: string
  usage: TokenUsage
  usd: number
  taskId?: string
  agentId?: string
  meta?: Record<string, string>
}

export interface CostTotals {
  totalUsd: number
  byProvider: Record<string, number>
  byModel: Record<string, number>
  byTask: Record<string, number>
  byAgent: Record<string, number>
}

export interface CostTrackerConfig {
  rateCards: RateCardRegistry
  now?: () => number
}

export type CostListener = (entry: CostEntry) => void

export class CostTracker {
  private readonly cards: RateCardRegistry
  private readonly now: () => number
  private readonly log: CostEntry[] = []
  private readonly listeners: CostListener[] = []

  constructor(cfg: CostTrackerConfig) {
    this.cards = cfg.rateCards
    this.now = cfg.now ?? Date.now
  }

  on(cb: CostListener): void {
    this.listeners.push(cb)
  }

  record(spec: CostRecordSpec): CostEntry {
    const card = this.cards.get(spec.provider, spec.model)
    const usd = computeUsdCost(card, spec.usage)
    const entry: CostEntry = {
      at: this.now(),
      provider: spec.provider,
      model: spec.model,
      usage: spec.usage,
      usd,
      taskId: spec.taskId,
      agentId: spec.agentId,
      meta: spec.meta,
    }
    this.log.push(entry)
    for (const cb of this.listeners) cb(entry)
    return entry
  }

  entries(): CostEntry[] {
    return [...this.log]
  }

  totals(): CostTotals {
    const byProvider: Record<string, number> = {}
    const byModel: Record<string, number> = {}
    const byTask: Record<string, number> = {}
    const byAgent: Record<string, number> = {}
    let total = 0
    for (const e of this.log) {
      total += e.usd
      byProvider[e.provider] = (byProvider[e.provider] ?? 0) + e.usd
      const modelKey = `${e.provider}/${e.model}`
      byModel[modelKey] = (byModel[modelKey] ?? 0) + e.usd
      if (e.taskId) byTask[e.taskId] = (byTask[e.taskId] ?? 0) + e.usd
      if (e.agentId) byAgent[e.agentId] = (byAgent[e.agentId] ?? 0) + e.usd
    }
    return { totalUsd: total, byProvider, byModel, byTask, byAgent }
  }

  reset(): void {
    this.log.length = 0
  }
}
