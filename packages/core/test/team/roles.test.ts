import { describe, expect, test } from "bun:test"
import { getRole, listRoles, ROLE_CATALOG } from "../../src/team/roles.ts"

describe("ROLE_CATALOG", () => {
  test("exactly 13 roles cataloged", () => {
    expect(Object.keys(ROLE_CATALOG)).toHaveLength(13)
  })

  test("every role has at least one CLI preference", () => {
    for (const role of listRoles()) {
      expect(role.cliPreference.length).toBeGreaterThan(0)
    }
  })

  test("budget shares are individually in [0, 1]", () => {
    for (const role of listRoles()) {
      expect(role.budgetShare).toBeGreaterThan(0)
      expect(role.budgetShare).toBeLessThanOrEqual(1)
    }
  })

  test("tiers are one of executor/advisor/fallback", () => {
    for (const role of listRoles()) {
      expect(["executor", "advisor", "fallback"]).toContain(role.tier)
    }
  })

  test("getRole returns known, throws on unknown", () => {
    expect(getRole("backend").id).toBe("backend")
    // @ts-expect-error — intentionally bad id
    expect(() => getRole("nope")).toThrow()
  })

  test("descriptions are non-empty", () => {
    for (const role of listRoles()) {
      expect(role.description.length).toBeGreaterThan(10)
    }
  })
})
