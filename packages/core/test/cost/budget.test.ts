import { describe, expect, test } from "bun:test"

import {
  BudgetEnforcer,
  BudgetExceededError,
  type BudgetWarning,
} from "../../src/cost/budget.ts"
import { CostTracker } from "../../src/cost/tracker.ts"
import { RateCardRegistry } from "../../src/cost/ratecard.ts"

function now(): () => number {
  let t = 1_700_000_000_000
  return () => t
}

describe("BudgetEnforcer — record + usage", () => {
  test("tracks totals per task + session + day", () => {
    const b = new BudgetEnforcer({ limits: {} })
    b.record({ taskId: "t1", sessionId: "s1", usd: 0.05, at: 1_000 })
    b.record({ taskId: "t1", sessionId: "s1", usd: 0.03, at: 1_500 })
    b.record({ taskId: "t2", sessionId: "s1", usd: 0.02, at: 2_000 })
    const u = b.usage()
    expect(u.taskUsd.t1).toBeCloseTo(0.08, 6)
    expect(u.taskUsd.t2).toBeCloseTo(0.02, 6)
    expect(u.sessionUsd.s1).toBeCloseTo(0.1, 6)
    expect(u.dayUsd).toBeCloseTo(0.1, 6)
  })
})

describe("BudgetEnforcer — check throws when over limit", () => {
  test("task limit", () => {
    const b = new BudgetEnforcer({ limits: { taskUsd: 0.15 } })
    b.record({ taskId: "t1", usd: 0.1, at: 1 })
    expect(() => b.check({ taskId: "t1" }, 0.06)).toThrow(BudgetExceededError)
  })

  test("session limit", () => {
    const b = new BudgetEnforcer({ limits: { sessionUsd: 2 } })
    b.record({ sessionId: "s1", usd: 1.95, at: 1 })
    let caught: unknown = null
    try {
      b.check({ sessionId: "s1" }, 0.1)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BudgetExceededError)
    expect((caught as BudgetExceededError).scope).toBe("session")
  })

  test("day limit", () => {
    const b = new BudgetEnforcer({ limits: { dayUsd: 10 }, now: now() })
    b.record({ usd: 9.5, at: 1_700_000_000_000 })
    expect(() => b.check({}, 0.6)).toThrow(BudgetExceededError)
  })

  test("no limit set → check passes", () => {
    const b = new BudgetEnforcer({ limits: {} })
    expect(() => b.check({ taskId: "t1" }, 9999)).not.toThrow()
  })

  test("passing at exact limit is allowed (inclusive)", () => {
    const b = new BudgetEnforcer({ limits: { taskUsd: 0.15 } })
    b.record({ taskId: "t1", usd: 0.1, at: 1 })
    expect(() => b.check({ taskId: "t1" }, 0.05)).not.toThrow()
  })
})

describe("BudgetEnforcer — day rollover", () => {
  test("records from yesterday do not count against today's day budget", () => {
    const clock = { t: new Date("2026-04-13T23:30:00Z").getTime() }
    const b = new BudgetEnforcer({
      limits: { dayUsd: 10 },
      now: () => clock.t,
    })
    b.record({ usd: 9, at: clock.t })
    clock.t = new Date("2026-04-14T00:30:00Z").getTime()
    // rollover — yesterday's $9 should not count toward today
    expect(() => b.check({}, 1)).not.toThrow()
    expect(b.usage().dayUsd).toBe(0)
  })
})

describe("BudgetEnforcer — warning thresholds", () => {
  test("onWarn fires at ≥80% utilization", () => {
    const seen: BudgetWarning[] = []
    const b = new BudgetEnforcer({
      limits: { taskUsd: 1 },
      onWarn: (w) => seen.push(w),
    })
    b.record({ taskId: "t1", usd: 0.5, at: 1 })
    expect(seen.length).toBe(0)
    b.record({ taskId: "t1", usd: 0.35, at: 2 })
    expect(seen.length).toBe(1)
    expect(seen[0]?.scope).toBe("task")
    expect(seen[0]?.id).toBe("t1")
    expect(seen[0]?.utilization).toBeGreaterThanOrEqual(0.8)
  })

  test("warnings fire once per threshold crossing per scope id", () => {
    const seen: BudgetWarning[] = []
    const b = new BudgetEnforcer({
      limits: { sessionUsd: 1 },
      onWarn: (w) => seen.push(w),
    })
    b.record({ sessionId: "s1", usd: 0.85, at: 1 }) // crosses 80%
    b.record({ sessionId: "s1", usd: 0.02, at: 2 }) // still ≥80 — no new warning
    expect(seen.filter((w) => w.threshold === 0.8).length).toBe(1)
  })

  test("custom warning thresholds supported (e.g. 0.5, 0.9)", () => {
    const seen: BudgetWarning[] = []
    const b = new BudgetEnforcer({
      limits: { dayUsd: 10 },
      warningThresholds: [0.5, 0.9],
      onWarn: (w) => seen.push(w),
    })
    b.record({ usd: 6, at: 1 }) // crosses 0.5 threshold
    b.record({ usd: 3.5, at: 2 }) // crosses 0.9 threshold
    expect(seen.map((w) => w.threshold)).toEqual([0.5, 0.9])
  })
})

describe("BudgetEnforcer — CostTracker subscription", () => {
  test("attachTo(tracker) automatically records every cost entry", () => {
    const rateCards = new RateCardRegistry()
    rateCards.register({
      provider: "p1",
      model: "m1",
      inputPerMillion: 1_000,
      outputPerMillion: 1_000,
    })
    const tracker = new CostTracker({ rateCards })
    const b = new BudgetEnforcer({ limits: {} })
    b.attachTo(tracker)
    tracker.record({
      provider: "p1",
      model: "m1",
      usage: { input_tokens: 1_000, output_tokens: 1_000 },
      taskId: "t1",
      agentId: "a1",
    })
    expect(b.usage().taskUsd.t1).toBeGreaterThan(0)
  })
})
