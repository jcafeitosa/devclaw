import { NoRouteError } from "./errors.ts"
import type { RouteChoice, Tier } from "./types.ts"

export interface TierConfig {
  providerId: string
  model?: string
  fallbacks?: string[]
}

export interface ModelRouterConfig {
  tiers: Partial<Record<Tier, TierConfig>>
  available?: Set<string> | string[]
}

export class ModelRouter {
  private readonly tiers: Partial<Record<Tier, TierConfig>>
  private readonly available: Set<string>

  constructor(cfg: ModelRouterConfig) {
    this.tiers = cfg.tiers
    this.available = new Set(cfg.available instanceof Set ? cfg.available : (cfg.available ?? []))
  }

  choose(tier: Tier): RouteChoice {
    const t = this.tiers[tier]
    if (!t) throw new NoRouteError(tier)
    const candidates = [t.providerId, ...(t.fallbacks ?? [])]
    for (const providerId of candidates) {
      if (this.available.has(providerId)) {
        return {
          tier,
          providerId,
          model: providerId === t.providerId ? t.model : undefined,
        }
      }
    }
    throw new NoRouteError(tier)
  }

  markAvailable(providerId: string): void {
    this.available.add(providerId)
  }

  markUnavailable(providerId: string): void {
    this.available.delete(providerId)
  }
}
