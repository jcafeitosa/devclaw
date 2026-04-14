import { describe, expect, test } from "bun:test"
import { PolicyEngine } from "../../src/learning/policy_engine.ts"
import type { IndividualCapsule } from "../../src/learning/types.ts"

function capsule(
  id: string,
  score: number,
  applications: number,
  domain = "auth",
  tags: string[] = ["jwt"],
): IndividualCapsule {
  return {
    id,
    type: "individual",
    version: "1.0.0",
    createdAt: 0,
    updatedAt: 0,
    domain,
    agent: { id: "be" },
    triplet: { instinct: "Check exp first", experience: "saw 3 failures", skill: "jwt pattern" },
    observations: [],
    metadata: { tags, toolsUsed: [], skillsUsed: [], durationMs: 0, tokens: 0, costUsd: 0 },
    feedback: {
      applications,
      successes: applications,
      failures: 0,
      averageScore: score,
      scores: [score],
    },
  }
}

describe("PolicyEngine", () => {
  test("register + evaluate matches policy input", () => {
    const e = new PolicyEngine()
    e.register({
      id: "r1",
      description: "inject jwt hints",
      match: (i) => (i.tags ?? []).includes("jwt"),
      actions: [{ kind: "inject-context" }],
    })
    const evals = e.evaluate({ tags: ["jwt"] })
    expect(evals).toHaveLength(1)
    expect(evals[0]?.ruleId).toBe("r1")
  })

  test("disabled rules skipped", () => {
    const e = new PolicyEngine()
    e.register({
      id: "r1",
      description: "",
      match: () => true,
      actions: [],
    })
    e.enable("r1", false)
    expect(e.evaluate({})).toEqual([])
  })

  test("duplicate rule id rejected", () => {
    const e = new PolicyEngine()
    const rule = { id: "r", description: "", match: () => true, actions: [] }
    e.register(rule)
    expect(() => e.register(rule)).toThrow(/already/i)
  })

  test("deriveFromCapsules filters by score + applications", () => {
    const e = new PolicyEngine()
    const rules = e.deriveFromCapsules(
      [capsule("good", 0.9, 5), capsule("low", 0.3, 10), capsule("few", 0.9, 1)],
      { minScore: 0.7, minApplications: 3 },
    )
    expect(rules.map((r) => r.sourceCapsuleId)).toEqual(["good"])
  })

  test("derived rule matches by domain + tags", () => {
    const e = new PolicyEngine()
    const [rule] = e.deriveFromCapsules([capsule("c", 0.9, 5, "auth", ["jwt"])])
    expect(rule?.match({ domain: "auth", tags: ["jwt"] })).toBe(true)
    expect(rule?.match({ domain: "payments" })).toBe(false)
    expect(rule?.match({ domain: "auth", tags: ["css"] })).toBe(false)
  })
})
