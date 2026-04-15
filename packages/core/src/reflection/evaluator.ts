import type { Step, StepState } from "../cognitive/types.ts"
import type { ProviderCatalog } from "../provider/catalog.ts"
import { EvaluationFailedError } from "./errors.ts"
import type { CriterionResult, Evaluation, EvaluationCriterion } from "./types.ts"

export interface Evaluator {
  evaluate(step: Step, state: StepState): Promise<Evaluation>
}

export interface RubricEvaluatorConfig {
  criteria: EvaluationCriterion[]
  threshold?: number
  catalog?: ProviderCatalog
  providerId?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

function parseScore(raw: string): number {
  const match = raw.match(/-?\d+(?:\.\d+)?/)
  if (!match) return 0
  const n = Number.parseFloat(match[0])
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export class RubricEvaluator implements Evaluator {
  private readonly threshold: number
  constructor(private readonly cfg: RubricEvaluatorConfig) {
    this.threshold = cfg.threshold ?? 0.5
  }

  async evaluate(step: Step, state: StepState): Promise<Evaluation> {
    if (state.status === "failed") {
      return {
        stepId: step.id,
        score: 0,
        passed: false,
        criteria: this.cfg.criteria.map<CriterionResult>((c) => ({
          id: c.id,
          score: 0,
          weight: c.weight ?? 1,
          feedback: "step failed",
        })),
        feedback: state.error ?? "step did not complete",
      }
    }
    if (this.cfg.criteria.length === 0) {
      return { stepId: step.id, score: 1, passed: true, criteria: [] }
    }
    const results: CriterionResult[] = []
    for (const c of this.cfg.criteria) {
      results.push(await this.runCriterion(c, step, state))
    }
    const totalWeight = results.reduce((n, r) => n + r.weight, 0) || 1
    const weighted = results.reduce((n, r) => n + r.score * r.weight, 0)
    const score = weighted / totalWeight
    return {
      stepId: step.id,
      score,
      passed: score >= this.threshold,
      criteria: results,
    }
  }

  private async runCriterion(
    c: EvaluationCriterion,
    step: Step,
    state: StepState,
  ): Promise<CriterionResult> {
    const weight = c.weight ?? 1
    try {
      if (c.kind === "programmatic") {
        if (!c.check) throw new Error(`criterion '${c.id}' missing check`)
        const score = await c.check(step, state)
        return { id: c.id, score, weight }
      }
      if (!this.cfg.catalog || !this.cfg.providerId) {
        throw new Error(`criterion '${c.id}' requires catalog + providerId for LLM`)
      }
      const prompt = `${c.prompt ?? c.description}\n\nStep: ${step.description}\nOutput: ${
        typeof state.output === "string" ? state.output : JSON.stringify(state.output)
      }\n\nRespond ONLY with a number between 0 and 1.`
      const raw = await this.cfg.catalog.generate(this.cfg.providerId, {
        prompt,
        model: this.cfg.model,
        maxTokens: this.cfg.maxTokens ?? 32,
        temperature: this.cfg.temperature,
      })
      return { id: c.id, score: parseScore(raw), weight }
    } catch (cause) {
      throw new EvaluationFailedError(step.id, cause)
    }
  }
}
