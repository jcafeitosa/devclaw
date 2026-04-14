import type { ErrorClass, ErrorSignal, TriggerType } from "./types.ts"

export interface Detector {
  classify(signal: ErrorSignal): ErrorClass
}

const TRIGGER_TO_CLASS: Record<TriggerType, ErrorClass> = {
  "test-failure": "code-defect",
  "lint-error": "style",
  "compile-error": "code-defect",
  "type-error": "types",
  "runtime-exception": "runtime",
  "low-eval-score": "quality",
  "user-feedback": "quality",
  "cost-overrun": "budget",
  "latency-spike": "performance",
  hallucination: "reasoning",
  unknown: "unknown",
}

const KEYWORD_HINTS: Array<{ match: RegExp; cls: ErrorClass }> = [
  { match: /type\s*error|cannot assign|incompatible types/i, cls: "types" },
  { match: /syntax|unexpected token/i, cls: "code-defect" },
  { match: /timeout|deadline|p95|latency/i, cls: "performance" },
  { match: /lint|format|style/i, cls: "style" },
  { match: /cost|budget|usd/i, cls: "budget" },
  { match: /hallucin|made\s*up|unsupported claim/i, cls: "reasoning" },
]

export class DefaultDetector implements Detector {
  classify(signal: ErrorSignal): ErrorClass {
    const triggerGuess = TRIGGER_TO_CLASS[signal.trigger] ?? "unknown"
    const haystack = `${signal.message} ${signal.detail ?? ""} ${signal.stack ?? ""}`
    for (const hint of KEYWORD_HINTS) {
      if (hint.match.test(haystack)) return hint.cls
    }
    return triggerGuess
  }
}
