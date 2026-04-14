import { describe, expect, test } from "bun:test"
import { NoRouteError } from "../../src/cognitive/errors.ts"
import { ModelRouter } from "../../src/cognitive/router.ts"

describe("ModelRouter", () => {
  test("routes tier to configured provider", () => {
    const r = new ModelRouter({
      tiers: {
        executor: { providerId: "openai", model: "gpt-4o-mini" },
        advisor: { providerId: "anthropic", model: "claude-opus" },
      },
      available: new Set(["openai", "anthropic"]),
    })
    expect(r.choose("executor").providerId).toBe("openai")
    expect(r.choose("advisor").model).toBe("claude-opus")
  })

  test("falls back through fallbacks[] when primary unavailable", () => {
    const r = new ModelRouter({
      tiers: {
        executor: { providerId: "openai", model: "x", fallbacks: ["anthropic"] },
        advisor: { providerId: "anthropic" },
      },
      available: new Set(["anthropic"]),
    })
    const choice = r.choose("executor")
    expect(choice.providerId).toBe("anthropic")
    expect(choice.tier).toBe("executor")
  })

  test("throws NoRouteError when no tier provider available", () => {
    const r = new ModelRouter({
      tiers: {
        executor: { providerId: "openai" },
      },
      available: new Set(),
    })
    expect(() => r.choose("executor")).toThrow(NoRouteError)
  })

  test("throws NoRouteError when tier not configured", () => {
    const r = new ModelRouter({
      tiers: { executor: { providerId: "openai" } },
      available: new Set(["openai"]),
    })
    expect(() => r.choose("advisor")).toThrow(NoRouteError)
  })

  test("markAvailable/markUnavailable updates runtime routing", () => {
    const r = new ModelRouter({
      tiers: {
        executor: { providerId: "openai", fallbacks: ["anthropic"] },
      },
      available: new Set(["openai", "anthropic"]),
    })
    expect(r.choose("executor").providerId).toBe("openai")
    r.markUnavailable("openai")
    expect(r.choose("executor").providerId).toBe("anthropic")
    r.markAvailable("openai")
    expect(r.choose("executor").providerId).toBe("openai")
  })
})
