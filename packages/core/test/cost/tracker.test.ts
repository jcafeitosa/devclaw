import { describe, expect, test } from "bun:test"
import { RateCardRegistry } from "../../src/cost/ratecard.ts"
import { CostTracker } from "../../src/cost/tracker.ts"

function rcards() {
  const r = new RateCardRegistry()
  r.register({
    provider: "anthropic",
    model: "claude-opus-4-6",
    inputPerMillion: 15,
    outputPerMillion: 75,
  })
  r.register({
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputPerMillion: 1,
    outputPerMillion: 5,
  })
  return r
}

describe("CostTracker", () => {
  test("record() computes cost from rate card and stores entry", () => {
    const t = new CostTracker({ rateCards: rcards() })
    const entry = t.record({
      provider: "anthropic",
      model: "claude-opus-4-6",
      usage: { input_tokens: 1_000_000, output_tokens: 500_000 },
      taskId: "task-1",
    })
    expect(entry.usd).toBeCloseTo(15 + 37.5, 4)
    expect(t.entries()).toHaveLength(1)
  })

  test("totals aggregates by provider/model/task", () => {
    const t = new CostTracker({ rateCards: rcards() })
    t.record({
      provider: "anthropic",
      model: "claude-opus-4-6",
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
      taskId: "a",
    })
    t.record({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
      taskId: "a",
    })
    t.record({
      provider: "anthropic",
      model: "claude-opus-4-6",
      usage: { input_tokens: 0, output_tokens: 1_000_000 },
      taskId: "b",
    })
    const totals = t.totals()
    expect(totals.byProvider.anthropic).toBeCloseTo(15 + 1 + 75, 4)
    expect(totals.byModel["anthropic/claude-opus-4-6"]).toBeCloseTo(15 + 75, 4)
    expect(totals.byTask.a).toBeCloseTo(16, 4)
  })

  test("emits cost_recorded event when subscribed", () => {
    const t = new CostTracker({ rateCards: rcards() })
    const seen: number[] = []
    t.on((entry) => seen.push(entry.usd))
    t.record({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    })
    expect(seen).toEqual([1])
  })

  test("reset() clears entries", () => {
    const t = new CostTracker({ rateCards: rcards() })
    t.record({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      usage: { input_tokens: 100, output_tokens: 100 },
    })
    t.reset()
    expect(t.entries()).toHaveLength(0)
  })
})
