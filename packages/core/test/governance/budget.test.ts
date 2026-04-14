import { describe, expect, test } from "bun:test"
import { BudgetSystem } from "../../src/governance/budget.ts"
import { GovernanceBudgetExceededError } from "../../src/governance/errors.ts"

describe("BudgetSystem", () => {
  test("charge updates usage + walks chain", () => {
    const b = new BudgetSystem()
    b.defineScope({ id: "company", kind: "company", limit: { softUsd: 100, hardUsd: 200 } })
    b.defineScope({ id: "proj", kind: "project", parentId: "company", limit: { softUsd: 40 } })
    b.charge("proj", { costUsd: 30 })
    expect(b.usage("proj").usedUsd).toBe(30)
    expect(b.usage("company").usedUsd).toBe(30)
  })

  test("soft warning emitted but continues", () => {
    const b = new BudgetSystem()
    const seen: number[] = []
    b.defineScope({ id: "p", kind: "project", limit: { softUsd: 10, hardUsd: 100 } })
    b.events.on("budget_soft_warning", (e) => seen.push(e.value))
    b.charge("p", { costUsd: 20 })
    expect(seen).toContain(20)
  })

  test("hard stop throws GovernanceBudgetExceededError", () => {
    const b = new BudgetSystem()
    b.defineScope({ id: "p", kind: "project", limit: { hardUsd: 10 } })
    expect(() => b.charge("p", { costUsd: 15 })).toThrow(GovernanceBudgetExceededError)
  })

  test("wouldBreach previews cost without mutating", () => {
    const b = new BudgetSystem()
    b.defineScope({ id: "p", kind: "project", limit: { hardUsd: 10 } })
    expect(b.wouldBreach("p", { costUsd: 5 })).toBe(false)
    expect(b.wouldBreach("p", { costUsd: 20 })).toBe(true)
    expect(b.usage("p").usedUsd).toBe(0)
  })

  test("parent hard cap catches child charge", () => {
    const b = new BudgetSystem()
    b.defineScope({ id: "company", kind: "company", limit: { hardUsd: 20 } })
    b.defineScope({ id: "proj", kind: "project", parentId: "company", limit: {} })
    expect(() => b.charge("proj", { costUsd: 30 })).toThrow(GovernanceBudgetExceededError)
  })

  test("reset clears scope", () => {
    const b = new BudgetSystem()
    b.defineScope({ id: "p", kind: "project", limit: { hardUsd: 100 } })
    b.charge("p", { costUsd: 30 })
    b.reset("p")
    expect(b.usage("p").usedUsd).toBe(0)
  })
})
