import { describe, expect, test } from "bun:test"
import { DefaultDetector } from "../../src/correction/detector.ts"
import type { ErrorSignal, TriggerType } from "../../src/correction/types.ts"

function signal(trigger: TriggerType, message: string, detail?: string): ErrorSignal {
  return {
    id: "s",
    trigger,
    message,
    detail,
    at: Date.now(),
  }
}

describe("DefaultDetector", () => {
  const d = new DefaultDetector()

  test("trigger → baseline class mapping", () => {
    expect(d.classify(signal("test-failure", "x"))).toBe("code-defect")
    expect(d.classify(signal("lint-error", "x"))).toBe("style")
    expect(d.classify(signal("latency-spike", "x"))).toBe("performance")
    expect(d.classify(signal("hallucination", "x"))).toBe("reasoning")
  })

  test("keyword hints override trigger default", () => {
    expect(d.classify(signal("unknown", "Type error: cannot assign"))).toBe("types")
    expect(d.classify(signal("unknown", "timeout exceeded"))).toBe("performance")
    expect(d.classify(signal("unknown", "budget overrun $12"))).toBe("budget")
  })

  test("unknown trigger + no hint → 'unknown'", () => {
    expect(d.classify(signal("unknown", "something generic"))).toBe("unknown")
  })

  test("stack field participates in keyword match", () => {
    const s: ErrorSignal = {
      id: "x",
      trigger: "unknown",
      message: "oops",
      stack: "TypeError: foo",
      at: 0,
    }
    expect(d.classify(s)).toBe("types")
  })
})
