import type { ErrorClass, ErrorSignal, Hypothesis } from "./types.ts"

export interface Hypothesizer {
  generate(signal: ErrorSignal, errorClass: ErrorClass): Hypothesis[]
}

export interface HypothesisRule {
  id: string
  forClasses: ErrorClass[]
  description: string
  suggestedFixKind: string
  likelihood: number
  matches?: (signal: ErrorSignal) => boolean
}

const DEFAULT_RULES: HypothesisRule[] = [
  {
    id: "missing-import",
    forClasses: ["code-defect", "types"],
    description: "Required identifier is missing from imports",
    suggestedFixKind: "add-import",
    likelihood: 0.7,
    matches: (s) =>
      /is not defined|cannot find name|unresolved/i.test(`${s.message} ${s.detail ?? ""}`),
  },
  {
    id: "wrong-types",
    forClasses: ["types"],
    description: "Types at call-site do not match declared signature",
    suggestedFixKind: "adjust-types",
    likelihood: 0.6,
  },
  {
    id: "test-assertion",
    forClasses: ["code-defect"],
    description: "Test asserts current implementation is off-by-one or boundary issue",
    suggestedFixKind: "adjust-logic",
    likelihood: 0.55,
  },
  {
    id: "lint-format",
    forClasses: ["style"],
    description: "Formatter disagrees with current layout",
    suggestedFixKind: "apply-formatter",
    likelihood: 0.95,
  },
  {
    id: "null-access",
    forClasses: ["runtime"],
    description: "Null/undefined access on value that may be absent",
    suggestedFixKind: "null-guard",
    likelihood: 0.65,
    matches: (s) =>
      /undefined|null|cannot read|property .* of/i.test(`${s.message} ${s.detail ?? ""}`),
  },
  {
    id: "cost-cap",
    forClasses: ["budget"],
    description: "Model tier too expensive for task",
    suggestedFixKind: "downgrade-model",
    likelihood: 0.7,
  },
  {
    id: "latency-n1",
    forClasses: ["performance"],
    description: "N+1 or missing index / cache",
    suggestedFixKind: "optimize-data-access",
    likelihood: 0.5,
  },
  {
    id: "unsupported-claim",
    forClasses: ["reasoning"],
    description: "Agent produced unsupported claim; needs grounding",
    suggestedFixKind: "ground-with-sources",
    likelihood: 0.6,
  },
  {
    id: "eval-criteria",
    forClasses: ["quality"],
    description: "Output missed evaluation rubric criterion",
    suggestedFixKind: "revisit-criteria",
    likelihood: 0.5,
  },
]

export interface DefaultHypothesizerConfig {
  extraRules?: HypothesisRule[]
}

export class DefaultHypothesizer implements Hypothesizer {
  private readonly rules: HypothesisRule[]

  constructor(cfg: DefaultHypothesizerConfig = {}) {
    this.rules = [...DEFAULT_RULES, ...(cfg.extraRules ?? [])]
  }

  generate(signal: ErrorSignal, errorClass: ErrorClass): Hypothesis[] {
    const candidates: Hypothesis[] = []
    for (const rule of this.rules) {
      if (!rule.forClasses.includes(errorClass)) continue
      let likelihood = rule.likelihood
      if (rule.matches) {
        likelihood = rule.matches(signal) ? Math.min(1, likelihood + 0.2) : likelihood - 0.2
      }
      if (likelihood <= 0) continue
      candidates.push({
        id: `hyp_${rule.id}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        description: rule.description,
        likelihood,
        suggestedFixKind: rule.suggestedFixKind,
      })
    }
    candidates.sort((a, b) => b.likelihood - a.likelihood)
    return candidates
  }
}
