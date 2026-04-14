export interface ModelTier {
  provider: string
  model: string
}

export interface CostModelRouterConfig {
  tiers: ModelTier[]
  minSuccessRate?: number
  minSamplesBeforeLearning?: number
}

export interface ModelStats {
  attempts: number
  successes: number
  successRate: number
}

function tierKey(t: ModelTier): string {
  return `${t.provider}/${t.model}`
}

function statsKey(taskType: string, t: ModelTier): string {
  return `${taskType}::${tierKey(t)}`
}

export class CostModelRouter {
  private readonly tiers: ModelTier[]
  private readonly minSuccessRate: number
  private readonly minSamples: number
  private readonly counters = new Map<string, { attempts: number; successes: number }>()

  constructor(cfg: CostModelRouterConfig) {
    if (cfg.tiers.length === 0) throw new Error("CostModelRouter requires at least one tier")
    this.tiers = cfg.tiers
    this.minSuccessRate = cfg.minSuccessRate ?? 0.7
    this.minSamples = cfg.minSamplesBeforeLearning ?? 5
  }

  choose(taskType: string): ModelTier {
    for (const tier of this.tiers) {
      if (this.tierAllowed(taskType, tier)) return tier
    }
    return this.tiers[0]!
  }

  escalate(_taskType: string, current: ModelTier): ModelTier | undefined {
    const idx = this.tiers.findIndex((t) => tierKey(t) === tierKey(current))
    if (idx < 0) return this.tiers[0]
    return this.tiers[idx + 1]
  }

  recordOutcome(taskType: string, tier: ModelTier, success: boolean): void {
    const k = statsKey(taskType, tier)
    const cur = this.counters.get(k) ?? { attempts: 0, successes: 0 }
    cur.attempts++
    if (success) cur.successes++
    this.counters.set(k, cur)
  }

  stats(taskType: string, tier: ModelTier): ModelStats {
    const cur = this.counters.get(statsKey(taskType, tier)) ?? { attempts: 0, successes: 0 }
    return {
      attempts: cur.attempts,
      successes: cur.successes,
      successRate: cur.attempts > 0 ? cur.successes / cur.attempts : 1,
    }
  }

  private tierAllowed(taskType: string, tier: ModelTier): boolean {
    const s = this.stats(taskType, tier)
    if (s.attempts < this.minSamples) return true
    return s.successRate >= this.minSuccessRate
  }
}
