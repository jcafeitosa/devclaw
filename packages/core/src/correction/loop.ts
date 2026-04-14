import { EventEmitter } from "../util/event_emitter.ts"
import { CorrectionBudget, type CorrectionBudgetConfig } from "./budget.ts"
import { DefaultDetector, type Detector } from "./detector.ts"
import { DefaultHypothesizer, type Hypothesizer } from "./hypothesizer.ts"
import type {
  CorrectionEventMap,
  CorrectionOutcome,
  ErrorSignal,
  FixAttempt,
  Hypothesis,
  VerificationResult,
} from "./types.ts"

export interface FixerInput {
  signal: ErrorSignal
  hypothesis: Hypothesis
  attemptIndex: number
}

export interface FixerOutput {
  output?: string
  costUsd?: number
  tokens?: number
}

export type Fixer = (input: FixerInput) => Promise<FixerOutput>

export type Verifier = (signal: ErrorSignal) => Promise<VerificationResult>

export interface CorrectionLoopConfig {
  detector?: Detector
  hypothesizer?: Hypothesizer
  fixer: Fixer
  verifier: Verifier
  budget?: CorrectionBudgetConfig
  specialistAvailable?: boolean
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export class CorrectionLoop {
  readonly events = new EventEmitter<CorrectionEventMap>()
  private readonly detector: Detector
  private readonly hypothesizer: Hypothesizer
  private readonly fixer: Fixer
  private readonly verifier: Verifier
  private readonly budgetCfg: CorrectionBudgetConfig
  private readonly specialistAvailable: boolean

  constructor(cfg: CorrectionLoopConfig) {
    this.detector = cfg.detector ?? new DefaultDetector()
    this.hypothesizer = cfg.hypothesizer ?? new DefaultHypothesizer()
    this.fixer = cfg.fixer
    this.verifier = cfg.verifier
    this.budgetCfg = cfg.budget ?? {}
    this.specialistAvailable = cfg.specialistAvailable ?? false
  }

  async run(signal: ErrorSignal): Promise<CorrectionOutcome> {
    const budget = new CorrectionBudget(this.budgetCfg)
    const errorClass = this.detector.classify(signal)
    this.events.emit("correction_started", { signal })
    const hypotheses = this.hypothesizer.generate(signal, errorClass)
    this.events.emit("hypothesis_generated", { hypotheses })
    const attempts: FixAttempt[] = []
    for (const hypothesis of hypotheses) {
      if (!budget.canAttempt()) break
      const attempt: FixAttempt = {
        id: nextId("attempt"),
        hypothesisId: hypothesis.id,
        startedAt: Date.now(),
        success: false,
      }
      budget.startAttempt()
      this.events.emit("fix_attempt_started", { attempt })
      let verification: VerificationResult = { ok: false, reason: "fixer threw" }
      try {
        const out = await this.fixer({
          signal,
          hypothesis,
          attemptIndex: budget.snapshot().attempts,
        })
        budget.record({ costUsd: out.costUsd, tokens: out.tokens })
        attempt.costUsd = out.costUsd
        attempt.tokens = out.tokens
        attempt.output = out.output
        verification = await this.verifier(signal)
        attempt.success = verification.ok
      } catch (err) {
        verification = {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        }
      }
      attempt.completedAt = Date.now()
      attempts.push(attempt)
      this.events.emit("fix_attempt_finished", { attempt, verification })
      if (attempt.success) {
        return this.finish(signal, attempts, errorClass, budget, "resolved")
      }
    }
    const decision = this.specialistAvailable ? "specialist" : "human"
    return this.finish(signal, attempts, errorClass, budget, decision)
  }

  private finish(
    signal: ErrorSignal,
    attempts: FixAttempt[],
    errorClass: CorrectionOutcome["errorClass"],
    budget: CorrectionBudget,
    decision: CorrectionOutcome["decision"],
  ): CorrectionOutcome {
    const snap = budget.snapshot()
    const outcome: CorrectionOutcome = {
      signal,
      attempts,
      decision,
      errorClass,
      usedCostUsd: snap.costUsd,
      usedTokens: snap.tokens,
      durationMs: snap.durationMs,
    }
    if (decision === "resolved") this.events.emit("correction_resolved", { outcome })
    else this.events.emit("correction_escalated", { outcome })
    return outcome
  }
}
