import { describe, expect, test } from "bun:test"
import {
  ApprovalRequestNotFoundError,
  GateNotRegisteredError,
  GovernanceBudgetExceededError,
  GovernanceError,
  NoOwnerError,
  OrphanGoalError,
} from "../../src/governance/errors.ts"

describe("Governance errors", () => {
  test("base code", () => {
    expect(new GovernanceError("x").code).toBe("BASE")
  })

  test("GateNotRegistered", () => {
    expect(new GateNotRegisteredError("security").gate).toBe("security")
  })

  test("ApprovalRequestNotFound", () => {
    expect(new ApprovalRequestNotFoundError("r1").id).toBe("r1")
  })

  test("BudgetExceeded keeps scope + kind + values", () => {
    const e = new GovernanceBudgetExceededError("proj", "hard", 15, 10)
    expect(e.scopeId).toBe("proj")
    expect(e.limitKind).toBe("hard")
    expect(e.value).toBe(15)
    expect(e.limit).toBe(10)
  })

  test("OrphanGoal", () => {
    expect(new OrphanGoalError("task", "project").expectedParent).toBe("project")
  })

  test("NoOwner", () => {
    expect(new NoOwnerError("i1").itemId).toBe("i1")
  })
})
