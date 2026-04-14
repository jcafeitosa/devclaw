import { describe, expect, test } from "bun:test"
import { TeamAssembler } from "../../src/team/assembler.ts"
import type { ProjectSpec } from "../../src/team/types.ts"

function spec(overrides: Partial<ProjectSpec> = {}): ProjectSpec {
  return {
    id: "p",
    name: "Test",
    techStack: [],
    ...overrides,
  }
}

describe("TeamAssembler", () => {
  const a = new TeamAssembler()

  test("always includes pm + coordinator", () => {
    const team = a.assemble(spec())
    expect(team.members.map((m) => m.role)).toContain("pm")
    expect(team.members.map((m) => m.role)).toContain("coordinator")
  })

  test("adds architect when design phase required", () => {
    const team = a.assemble(spec({ hasDesignPhase: true }))
    expect(team.members.map((m) => m.role)).toContain("architect")
  })

  test("adds backend when techStack has backend keyword", () => {
    const team = a.assemble(spec({ techStack: ["elysia", "postgres"] }))
    expect(team.members.map((m) => m.role)).toContain("backend")
  })

  test("adds frontend when techStack has frontend keyword", () => {
    const team = a.assemble(spec({ techStack: ["astro", "solid"] }))
    expect(team.members.map((m) => m.role)).toContain("frontend")
  })

  test("adds data when hasDatabaseChanges", () => {
    const team = a.assemble(spec({ hasDatabaseChanges: true }))
    expect(team.members.map((m) => m.role)).toContain("data")
  })

  test("adds security when riskClass ≥ medium", () => {
    expect(a.assemble(spec({ riskClass: "medium" })).members.map((m) => m.role)).toContain(
      "security",
    )
    expect(a.assemble(spec({ riskClass: "high" })).members.map((m) => m.role)).toContain("security")
    expect(a.assemble(spec({ riskClass: "low" })).members.map((m) => m.role)).not.toContain(
      "security",
    )
  })

  test("adds qa + sre when isReleaseTarget", () => {
    const team = a.assemble(spec({ isReleaseTarget: true }))
    const ids = team.members.map((m) => m.role)
    expect(ids).toContain("qa")
    expect(ids).toContain("sre")
  })

  test("adds doc when publicFacing", () => {
    expect(a.assemble(spec({ publicFacing: true })).members.map((m) => m.role)).toContain("doc")
  })

  test("adds research when usesNewTech", () => {
    expect(a.assemble(spec({ usesNewTech: true })).members.map((m) => m.role)).toContain("research")
  })

  test("budget normalized across included members (sums ≈ total)", () => {
    const team = a.assemble(spec({ isReleaseTarget: true, totalBudgetUsd: 100 }))
    const sum = team.members.reduce((n, m) => n + m.budgetShare * team.totalBudgetUsd, 0)
    expect(sum).toBeCloseTo(team.totalBudgetUsd, 2)
  })

  test("member.cli uses role's first preference", () => {
    const team = a.assemble(spec({ techStack: ["astro"] }))
    const fe = team.members.find((m) => m.role === "frontend")
    expect(fe?.cli).toBe("codex")
  })

  test("total budget defaults to reasonable number when unset", () => {
    expect(a.assemble(spec()).totalBudgetUsd).toBeGreaterThan(0)
  })
})
