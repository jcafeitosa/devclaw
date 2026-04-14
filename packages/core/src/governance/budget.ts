import { EventEmitter } from "../util/event_emitter.ts"
import { GovernanceBudgetExceededError } from "./errors.ts"
import type { BudgetCharge, BudgetLimit, BudgetScope } from "./types.ts"

export interface BudgetEvents extends Record<string, unknown> {
  budget_soft_warning: { scopeId: string; value: number; limit: number }
  budget_hard_stop: { scopeId: string; value: number; limit: number }
  budget_charged: { scopeId: string; charge: BudgetCharge; total: number }
}

interface ScopeState {
  scope: BudgetScope
  usedUsd: number
  usedTokens: number
}

export class BudgetSystem {
  readonly events = new EventEmitter<BudgetEvents>()
  private readonly states = new Map<string, ScopeState>()

  defineScope(scope: BudgetScope): BudgetScope {
    this.states.set(scope.id, { scope, usedUsd: 0, usedTokens: 0 })
    return scope
  }

  listScopes(): BudgetScope[] {
    return [...this.states.values()].map((s) => s.scope)
  }

  usage(scopeId: string): { usedUsd: number; usedTokens: number; limit: BudgetLimit } {
    const state = this.must(scopeId)
    return { usedUsd: state.usedUsd, usedTokens: state.usedTokens, limit: state.scope.limit }
  }

  charge(scopeId: string, charge: BudgetCharge): void {
    const chain = this.chain(scopeId)
    for (const state of chain) {
      state.usedUsd += charge.costUsd
      if (charge.tokens) state.usedTokens += charge.tokens
      this.events.emit("budget_charged", {
        scopeId: state.scope.id,
        charge,
        total: state.usedUsd,
      })
      this.enforce(state)
    }
  }

  wouldBreach(scopeId: string, charge: BudgetCharge): boolean {
    const chain = this.chain(scopeId)
    for (const state of chain) {
      const hard = state.scope.limit.hardUsd
      if (hard !== undefined && state.usedUsd + charge.costUsd > hard) return true
    }
    return false
  }

  reset(scopeId: string): void {
    const state = this.must(scopeId)
    state.usedUsd = 0
    state.usedTokens = 0
  }

  private enforce(state: ScopeState): void {
    const { hardUsd, softUsd } = state.scope.limit
    if (
      softUsd !== undefined &&
      state.usedUsd > softUsd &&
      (hardUsd === undefined || state.usedUsd <= hardUsd)
    ) {
      this.events.emit("budget_soft_warning", {
        scopeId: state.scope.id,
        value: state.usedUsd,
        limit: softUsd,
      })
    }
    if (hardUsd !== undefined && state.usedUsd > hardUsd) {
      this.events.emit("budget_hard_stop", {
        scopeId: state.scope.id,
        value: state.usedUsd,
        limit: hardUsd,
      })
      throw new GovernanceBudgetExceededError(state.scope.id, "hard", state.usedUsd, hardUsd)
    }
  }

  private must(scopeId: string): ScopeState {
    const state = this.states.get(scopeId)
    if (!state) throw new Error(`governance: budget scope '${scopeId}' not defined`)
    return state
  }

  private chain(scopeId: string): ScopeState[] {
    const out: ScopeState[] = []
    let current: ScopeState | undefined = this.must(scopeId)
    const seen = new Set<string>()
    while (current && !seen.has(current.scope.id)) {
      out.push(current)
      seen.add(current.scope.id)
      current = current.scope.parentId ? this.states.get(current.scope.parentId) : undefined
    }
    return out
  }
}
