import { describe, expect, test } from "bun:test"
import { ExperienceEngine } from "../../src/learning/experience_engine.ts"
import { CapsuleStore } from "../../src/learning/store.ts"
import type { IndividualCapsule } from "../../src/learning/types.ts"

function capsule(id: string): IndividualCapsule {
  return {
    id,
    type: "individual",
    version: "1.0.0",
    createdAt: 0,
    updatedAt: 0,
    domain: "auth",
    agent: { id: "be" },
    triplet: { instinct: "I1", experience: "E1", skill: "S1" },
    observations: [],
    metadata: {
      tags: ["jwt"],
      toolsUsed: ["Read"],
      skillsUsed: [],
      durationMs: 0,
      tokens: 0,
      costUsd: 0,
    },
    feedback: {
      applications: 0,
      successes: 0,
      failures: 0,
      averageScore: null,
      scores: [],
    },
  }
}

describe("ExperienceEngine", () => {
  test("create registers capsule + emits event", () => {
    const store = new CapsuleStore()
    const engine = new ExperienceEngine({ store })
    let seen = ""
    engine.events.on("capsule_created", ({ capsule }) => {
      seen = capsule.id
    })
    engine.create(capsule("c1"))
    expect(seen).toBe("c1")
    expect(store.get("c1").id).toBe("c1")
  })

  test("apply increments applications + returns bundle", () => {
    const store = new CapsuleStore()
    const engine = new ExperienceEngine({ store })
    engine.create(capsule("c1"))
    const bundle = engine.apply("c1")
    expect(bundle.instinct).toBe("I1")
    expect(bundle.skillHint).toBe("S1")
    expect(store.get("c1").feedback.applications).toBe(1)
    engine.apply("c1")
    expect(store.get("c1").feedback.applications).toBe(2)
  })

  test("feedback updates rolling average + flags low score", () => {
    const store = new CapsuleStore()
    const engine = new ExperienceEngine({ store, lowScoreThreshold: 0.5 })
    engine.create(capsule("c1"))
    let flagged = false
    engine.events.on("capsule_flagged_for_review", () => {
      flagged = true
    })
    engine.feedback("c1", { score: 0.3 })
    expect(store.get("c1").feedback.averageScore).toBeCloseTo(0.3, 5)
    expect(flagged).toBe(true)
  })

  test("feedback clamps score to [0,1]", () => {
    const store = new CapsuleStore()
    const engine = new ExperienceEngine({ store })
    engine.create(capsule("c1"))
    engine.feedback("c1", { score: 1.5 })
    expect(store.get("c1").feedback.scores[0]).toBe(1)
    engine.feedback("c1", { score: -0.5 })
    expect(store.get("c1").feedback.scores[1]).toBe(0)
  })

  test("outcome tags increments success/failure counters", () => {
    const store = new CapsuleStore()
    const engine = new ExperienceEngine({ store })
    engine.create(capsule("c1"))
    engine.feedback("c1", { score: 0.9, outcome: "success" })
    engine.feedback("c1", { score: 0.2, outcome: "failure" })
    const f = store.get("c1").feedback
    expect(f.successes).toBe(1)
    expect(f.failures).toBe(1)
  })

  test("average flag NOT fired when score healthy", () => {
    const store = new CapsuleStore()
    const engine = new ExperienceEngine({ store })
    engine.create(capsule("c1"))
    let flagged = false
    engine.events.on("capsule_flagged_for_review", () => {
      flagged = true
    })
    engine.feedback("c1", { score: 0.9 })
    expect(flagged).toBe(false)
  })
})
