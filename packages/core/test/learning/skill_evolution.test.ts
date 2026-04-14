import { describe, expect, test } from "bun:test"
import { NotReadyForPromotionError } from "../../src/learning/errors.ts"
import { SkillEvolution } from "../../src/learning/skill_evolution.ts"
import { CapsuleStore } from "../../src/learning/store.ts"
import type { IndividualCapsule } from "../../src/learning/types.ts"

function capsule(score: number, applications: number): IndividualCapsule {
  return {
    id: "c1",
    type: "individual",
    version: "1.0.0",
    createdAt: 0,
    updatedAt: 0,
    domain: "auth",
    agent: { id: "be" },
    triplet: {
      instinct: "Check exp first",
      experience: "saw 3 failures",
      skill: "jwt validation pattern",
    },
    observations: [],
    metadata: {
      tags: ["jwt"],
      toolsUsed: ["fs_read"],
      skillsUsed: [],
      durationMs: 0,
      tokens: 0,
      costUsd: 0,
    },
    feedback: {
      applications,
      successes: applications,
      failures: 0,
      averageScore: score,
      scores: Array.from({ length: applications }, () => score),
    },
  }
}

describe("SkillEvolution", () => {
  test("ready when score + applications meet thresholds", () => {
    const store = new CapsuleStore()
    store.register(capsule(0.85, 5))
    const evo = new SkillEvolution({ store })
    expect(evo.isReady("c1").ready).toBe(true)
  })

  test("not ready with low score", () => {
    const store = new CapsuleStore()
    store.register(capsule(0.4, 10))
    const evo = new SkillEvolution({ store })
    const { ready, reasons } = evo.isReady("c1")
    expect(ready).toBe(false)
    expect(reasons.some((r) => r.includes("score"))).toBe(true)
  })

  test("not ready with few applications", () => {
    const store = new CapsuleStore()
    store.register(capsule(0.9, 1))
    const evo = new SkillEvolution({ store })
    expect(evo.isReady("c1").ready).toBe(false)
  })

  test("promote emits Skill structure", () => {
    const store = new CapsuleStore()
    store.register(capsule(0.9, 5))
    const evo = new SkillEvolution({ store })
    const skill = evo.promote("c1")
    expect(skill.id).toBe("jwt-validation-pattern")
    expect(skill.status).toBe("review")
    expect(skill.tags).toContain("auto-evolved")
    expect(skill.source).toContain("capsule:c1")
  })

  test("promote when not ready throws NotReadyForPromotionError", () => {
    const store = new CapsuleStore()
    store.register(capsule(0.2, 0))
    const evo = new SkillEvolution({ store })
    expect(() => evo.promote("c1")).toThrow(NotReadyForPromotionError)
  })
})
