import { describe, expect, test } from "bun:test"
import { TeamAssembler } from "../../src/team/assembler.ts"
import { runPattern } from "../../src/team/patterns.ts"
import type { ProjectSpec } from "../../src/team/types.ts"

const fullProject: ProjectSpec = {
  id: "p",
  name: "full",
  techStack: ["bun", "astro"],
  hasDesignPhase: true,
  hasDatabaseChanges: true,
  riskClass: "high",
  isReleaseTarget: true,
  publicFacing: true,
  usesNewTech: true,
}

const assembler = new TeamAssembler()
const team = assembler.assemble(fullProject)

describe("runPattern", () => {
  test("waterfall assigns coordinator as primary with workers delegated", () => {
    const r = runPattern("waterfall", { team, topic: "build feature X" })
    expect(r.pattern).toBe("waterfall")
    expect(r.primary).toBe("coordinator")
    expect(r.interactions.some((i) => i.mode === "delegate")).toBe(true)
  })

  test("generator-verifier pairs worker with verifier", () => {
    const r = runPattern("generator-verifier", { team, topic: "migration" })
    expect(r.primary).toMatch(/backend|frontend|data/)
    expect(r.reviewers.length).toBeGreaterThan(0)
    expect(r.interactions.some((i) => i.mode === "debate")).toBe(true)
  })

  test("pair selects two workers that collaborate", () => {
    const r = runPattern("pair", { team, topic: "complex algo" })
    expect(r.interactions.every((i) => i.mode === "collab")).toBe(true)
    expect(r.reviewers.length).toBe(1)
  })

  test("council convenes multiple advisors", () => {
    const r = runPattern("council", { team, topic: "arch decision" })
    expect(r.interactions.every((i) => i.mode === "debate")).toBe(true)
    expect(r.advisors.length + 1).toBeGreaterThanOrEqual(2)
  })

  test("mentor pairs advisor with worker", () => {
    const r = runPattern("mentor", { team, topic: "new framework" })
    expect(r.advisors.length).toBe(1)
    expect(r.interactions.every((i) => i.mode === "collab")).toBe(true)
  })

  test("consult spawns specialist advisor", () => {
    const r = runPattern("consult", { team, topic: "perf issue" })
    expect(r.advisors.length).toBe(1)
    expect(r.interactions.length).toBe(2)
  })

  test("works with minimal team (only pm + coordinator)", () => {
    const slim = assembler.assemble({ id: "x", name: "slim", techStack: [] })
    const r = runPattern("generator-verifier", { team: slim, topic: "plan" })
    expect(r.pattern).toBe("generator-verifier")
  })
})
