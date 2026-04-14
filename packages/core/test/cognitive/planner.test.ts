import { describe, expect, test } from "bun:test"
import { PlanParseError } from "../../src/cognitive/errors.ts"
import { LLMPlanner, parsePlanFromJson, StubPlanner } from "../../src/cognitive/planner.ts"
import type { ProviderCatalog } from "../../src/provider/catalog.ts"

describe("parsePlanFromJson", () => {
  test("parses valid plan with steps[]", () => {
    const plan = parsePlanFromJson(
      "migrate db",
      JSON.stringify({
        steps: [
          { id: "a", description: "dump" },
          { id: "b", description: "apply", dependsOn: ["a"] },
        ],
      }),
    )
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[1]?.dependsOn).toEqual(["a"])
  })

  test("tolerates markdown fences around JSON", () => {
    const raw = '```json\n{"steps":[{"id":"a","description":"x"}]}\n```'
    const plan = parsePlanFromJson("g", raw)
    expect(plan.steps[0]?.id).toBe("a")
  })

  test("throws PlanParseError on non-json", () => {
    expect(() => parsePlanFromJson("g", "not json")).toThrow(PlanParseError)
  })

  test("throws when steps missing or empty", () => {
    expect(() => parsePlanFromJson("g", "{}")).toThrow(PlanParseError)
    expect(() => parsePlanFromJson("g", '{"steps":[]}')).toThrow(PlanParseError)
  })
})

describe("StubPlanner", () => {
  test("returns preset plan", async () => {
    const p = new StubPlanner([
      { id: "a", description: "a" },
      { id: "b", description: "b" },
    ])
    const plan = await p.plan({ goal: "g", expectedOutput: "x" })
    expect(plan.goal).toBe("g")
    expect(plan.steps.map((s) => s.id)).toEqual(["a", "b"])
  })
})

describe("LLMPlanner", () => {
  test("calls provider catalog with planning prompt and parses JSON", async () => {
    const seen: { prompt: string } = { prompt: "" }
    const catalog = {
      async generate(_id: string, opts: { prompt: string }) {
        seen.prompt = opts.prompt
        return JSON.stringify({
          steps: [{ id: "s1", description: "first", priority: 2 }],
        })
      },
    } as unknown as ProviderCatalog
    const planner = new LLMPlanner({ catalog, providerId: "anthropic" })
    const plan = await planner.plan({ goal: "migrate", expectedOutput: "plan" })
    expect(plan.steps[0]?.id).toBe("s1")
    expect(seen.prompt).toContain("migrate")
  })
})
