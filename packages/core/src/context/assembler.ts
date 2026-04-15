import { trimToBudget } from "./budget.ts"
import type { MultiSourceCollector } from "./collector.ts"
import { ContextEmptyError, ContextQualityError } from "./errors.ts"
import { applyThresholdFilter } from "./filter.ts"
import { OverlapRanker, TokenAwareRanker } from "./ranker.ts"
import type {
  ContextDiagnostic,
  ContextItem,
  ContextObject,
  ContextRequest,
  Ranker,
} from "./types.ts"

export interface AssemblerConfig {
  collector: MultiSourceCollector
  ranker?: Ranker
  defaultBudgetTokens?: number
  defaultMinQualityScore?: number
  relevantDataLimit?: number
}

export class ContextAssembler {
  private readonly cfg: Required<Omit<AssemblerConfig, "collector">> & {
    collector: MultiSourceCollector
  }

  constructor(cfg: AssemblerConfig) {
    this.cfg = {
      collector: cfg.collector,
      ranker: cfg.ranker ?? new TokenAwareRanker(new OverlapRanker()),
      defaultBudgetTokens: cfg.defaultBudgetTokens ?? 8000,
      defaultMinQualityScore: cfg.defaultMinQualityScore ?? 0,
      relevantDataLimit: cfg.relevantDataLimit ?? 5,
    }
  }

  async assemble(request: ContextRequest): Promise<ContextObject> {
    if (!request.expectedOutput || request.expectedOutput.trim().length === 0) {
      throw new ContextEmptyError("request.expectedOutput is required")
    }

    const diagnostics: ContextDiagnostic[] = []
    const collected = await this.cfg.collector.collect(request)
    diagnostics.push(...collected.diagnostics)

    const scored = collected.items.map<ContextItem>((item) => ({
      ...item,
      score: this.cfg.ranker.score(request, item),
    }))
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id))

    const minScore = request.minQualityScore ?? this.cfg.defaultMinQualityScore
    const filtered = applyThresholdFilter(scored, minScore)

    if (filtered.length === 0 && scored.length > 0) {
      const top = scored[0]?.score ?? 0
      throw new ContextQualityError("no items met min quality score", top, minScore)
    }

    const budget = request.budgetTokens ?? this.cfg.defaultBudgetTokens
    const { kept, dropped, tokensUsed } = trimToBudget(filtered, budget)
    if (dropped.length > 0) {
      diagnostics.push({
        level: "info",
        message: `budget trimmed ${dropped.length} items (${tokensUsed}/${budget} tokens used)`,
      })
    }

    const relevantData = kept.slice(0, this.cfg.relevantDataLimit)

    return {
      goal: request.goal,
      expectedOutput: request.expectedOutput,
      background: request.background,
      constraints: request.constraints ?? [],
      dependencies: request.dependencies ?? [],
      risks: request.risks ?? [],
      relevantData,
      items: kept,
      diagnostics,
      totals: { items: kept.length, tokens: tokensUsed },
    }
  }
}
