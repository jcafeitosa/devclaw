import { describe, expect, test } from "bun:test"
import { computeUsdCost, RateCardRegistry } from "../../src/cost/ratecard.ts"

describe("RateCardRegistry", () => {
  test("register + get round-trip", () => {
    const r = new RateCardRegistry()
    r.register({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputPerMillion: 1.0,
      outputPerMillion: 5.0,
    })
    const card = r.get("anthropic", "claude-haiku-4-5")
    expect(card.inputPerMillion).toBe(1.0)
  })

  test("unknown card throws", () => {
    const r = new RateCardRegistry()
    expect(() => r.get("anthropic", "ghost-1")).toThrow(/no rate card/)
  })

  test("listProviders + listModels", () => {
    const r = new RateCardRegistry()
    r.register({ provider: "a", model: "m1", inputPerMillion: 1, outputPerMillion: 1 })
    r.register({ provider: "a", model: "m2", inputPerMillion: 1, outputPerMillion: 1 })
    r.register({ provider: "b", model: "m3", inputPerMillion: 1, outputPerMillion: 1 })
    expect(r.listProviders().sort()).toEqual(["a", "b"])
    expect(r.listModels("a").sort()).toEqual(["m1", "m2"])
  })
})

describe("computeUsdCost", () => {
  test("computes input + output cost from token counts", () => {
    const card = {
      provider: "p",
      model: "m",
      inputPerMillion: 3.0,
      outputPerMillion: 15.0,
    }
    const cost = computeUsdCost(card, { input_tokens: 1_000_000, output_tokens: 200_000 })
    expect(cost).toBeCloseTo(3.0 + 3.0, 6)
  })

  test("zero tokens → zero cost", () => {
    const card = {
      provider: "p",
      model: "m",
      inputPerMillion: 100,
      outputPerMillion: 100,
    }
    expect(computeUsdCost(card, { input_tokens: 0, output_tokens: 0 })).toBe(0)
  })
})
