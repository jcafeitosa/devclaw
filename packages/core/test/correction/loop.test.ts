import { describe, expect, test } from "bun:test"
import { CorrectionLoop } from "../../src/correction/loop.ts"
import type { ErrorSignal } from "../../src/correction/types.ts"

function sig(message = "something failed"): ErrorSignal {
  return { id: "s1", trigger: "test-failure", message, at: Date.now() }
}

describe("CorrectionLoop", () => {
  test("resolves when first attempt verifies", async () => {
    let attemptCount = 0
    const loop = new CorrectionLoop({
      fixer: async () => {
        attemptCount++
        return { costUsd: 0.01 }
      },
      verifier: async () => ({ ok: true }),
    })
    const outcome = await loop.run(sig())
    expect(outcome.decision).toBe("resolved")
    expect(attemptCount).toBe(1)
    expect(outcome.attempts[0]?.success).toBe(true)
  })

  test("tries multiple hypotheses until verifier passes", async () => {
    let attempts = 0
    const loop = new CorrectionLoop({
      fixer: async () => {
        attempts++
        return { costUsd: 0.01 }
      },
      verifier: async () => ({ ok: attempts >= 2 }),
    })
    const outcome = await loop.run(sig("cannot read property foo of undefined"))
    expect(outcome.decision).toBe("resolved")
    expect(attempts).toBe(2)
  })

  test("escalates to human after exhausting attempts", async () => {
    const loop = new CorrectionLoop({
      fixer: async () => ({ costUsd: 0.01 }),
      verifier: async () => ({ ok: false, reason: "still broken" }),
      budget: { maxAttempts: 2 },
    })
    const outcome = await loop.run(sig("cannot read property"))
    expect(outcome.decision).toBe("human")
    expect(outcome.attempts.length).toBeLessThanOrEqual(2)
  })

  test("escalates to specialist when configured", async () => {
    const loop = new CorrectionLoop({
      fixer: async () => ({ costUsd: 0.01 }),
      verifier: async () => ({ ok: false }),
      budget: { maxAttempts: 1 },
      specialistAvailable: true,
    })
    const outcome = await loop.run(sig("cannot read"))
    expect(outcome.decision).toBe("specialist")
  })

  test("tracks cost and tokens across attempts", async () => {
    const loop = new CorrectionLoop({
      fixer: async () => ({ costUsd: 0.02, tokens: 100 }),
      verifier: async () => ({ ok: false }),
      budget: { maxAttempts: 2 },
    })
    const outcome = await loop.run(sig("undefined"))
    expect(outcome.usedCostUsd).toBeCloseTo(0.04, 5)
    expect(outcome.usedTokens).toBe(200)
  })

  test("events fire for lifecycle", async () => {
    const loop = new CorrectionLoop({
      fixer: async () => ({}),
      verifier: async () => ({ ok: true }),
    })
    const fired: string[] = []
    loop.events.on("correction_started", () => fired.push("started"))
    loop.events.on("hypothesis_generated", () => fired.push("hypotheses"))
    loop.events.on("fix_attempt_started", () => fired.push("attempt-start"))
    loop.events.on("fix_attempt_finished", () => fired.push("attempt-finish"))
    loop.events.on("correction_resolved", () => fired.push("resolved"))
    await loop.run(sig("undefined access"))
    expect(fired).toEqual(["started", "hypotheses", "attempt-start", "attempt-finish", "resolved"])
  })

  test("fixer throw is captured as failed verification", async () => {
    const loop = new CorrectionLoop({
      fixer: async () => {
        throw new Error("boom")
      },
      verifier: async () => ({ ok: true }),
      budget: { maxAttempts: 1 },
    })
    const outcome = await loop.run(sig("undefined"))
    expect(outcome.decision).toBe("human")
    expect(outcome.attempts[0]?.success).toBe(false)
  })
})
