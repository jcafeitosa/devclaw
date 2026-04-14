import { describe, expect, test } from "bun:test"
import { CostModelRouter } from "../../src/cost/router.ts"

describe("CostModelRouter — tier selection", () => {
  test("picks first (cheapest) tier on first call", () => {
    const r = new CostModelRouter({
      tiers: [
        { provider: "anthropic", model: "claude-haiku-4-5" },
        { provider: "anthropic", model: "claude-sonnet-4-6" },
        { provider: "anthropic", model: "claude-opus-4-6" },
      ],
    })
    const choice = r.choose("write_tests")
    expect(choice.model).toBe("claude-haiku-4-5")
  })

  test("escalate() returns next tier", () => {
    const r = new CostModelRouter({
      tiers: [
        { provider: "a", model: "m1" },
        { provider: "a", model: "m2" },
        { provider: "a", model: "m3" },
      ],
    })
    const first = r.choose("t")
    const second = r.escalate("t", first)
    expect(second?.model).toBe("m2")
    const third = r.escalate("t", second!)
    expect(third?.model).toBe("m3")
    expect(r.escalate("t", third!)).toBeUndefined()
  })
})

describe("CostModelRouter — learned escalation", () => {
  test("after enough failures, skips low-success tier on first choose", () => {
    const r = new CostModelRouter({
      tiers: [
        { provider: "a", model: "cheap" },
        { provider: "a", model: "smart" },
      ],
      minSuccessRate: 0.5,
      minSamplesBeforeLearning: 3,
    })
    for (let i = 0; i < 4; i++) {
      r.recordOutcome("t", { provider: "a", model: "cheap" }, false)
    }
    const choice = r.choose("t")
    expect(choice.model).toBe("smart")
  })

  test("success rate per (taskType, model) is independent", () => {
    const r = new CostModelRouter({
      tiers: [
        { provider: "a", model: "cheap" },
        { provider: "a", model: "smart" },
      ],
      minSuccessRate: 0.5,
      minSamplesBeforeLearning: 2,
    })
    for (let i = 0; i < 3; i++) r.recordOutcome("taskA", { provider: "a", model: "cheap" }, false)
    expect(r.choose("taskA").model).toBe("smart")
    expect(r.choose("taskB").model).toBe("cheap")
  })

  test("stats() exposes per-(task,model) success rate", () => {
    const r = new CostModelRouter({
      tiers: [{ provider: "a", model: "m" }],
    })
    r.recordOutcome("t", { provider: "a", model: "m" }, true)
    r.recordOutcome("t", { provider: "a", model: "m" }, false)
    r.recordOutcome("t", { provider: "a", model: "m" }, true)
    const s = r.stats("t", { provider: "a", model: "m" })
    expect(s.attempts).toBe(3)
    expect(s.successes).toBe(2)
    expect(s.successRate).toBeCloseTo(2 / 3, 4)
  })

  test("never returns empty tier list — falls back to top tier when all blocked", () => {
    const r = new CostModelRouter({
      tiers: [
        { provider: "a", model: "cheap" },
        { provider: "a", model: "smart" },
      ],
      minSuccessRate: 0.99,
      minSamplesBeforeLearning: 2,
    })
    for (let i = 0; i < 3; i++) {
      r.recordOutcome("t", { provider: "a", model: "cheap" }, false)
      r.recordOutcome("t", { provider: "a", model: "smart" }, false)
    }
    const choice = r.choose("t")
    expect(choice.model).toBe("cheap")
  })
})
