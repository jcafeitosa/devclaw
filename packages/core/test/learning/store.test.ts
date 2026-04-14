import { describe, expect, test } from "bun:test"
import { CapsuleImportError, CapsuleNotFoundError } from "../../src/learning/errors.ts"
import { CapsuleStore } from "../../src/learning/store.ts"
import type { IndividualCapsule } from "../../src/learning/types.ts"

function make(id: string, score: number | null, tags: string[] = []): IndividualCapsule {
  return {
    id,
    type: "individual",
    version: "1.0.0",
    createdAt: 0,
    updatedAt: 0,
    domain: "auth",
    agent: { id: "be" },
    triplet: { instinct: "x", experience: "y", skill: "z" },
    observations: [],
    metadata: { tags, toolsUsed: [], skillsUsed: [], durationMs: 0, tokens: 0, costUsd: 0 },
    feedback: {
      applications: 0,
      successes: 0,
      failures: 0,
      averageScore: score,
      scores: score === null ? [] : [score],
    },
  }
}

describe("CapsuleStore", () => {
  test("register + get + list", () => {
    const s = new CapsuleStore()
    s.register(make("a", null))
    s.register(make("b", null))
    expect(s.get("a").id).toBe("a")
    expect(s.list()).toHaveLength(2)
  })

  test("get unknown throws", () => {
    const s = new CapsuleStore()
    expect(() => s.get("missing")).toThrow(CapsuleNotFoundError)
  })

  test("search sorted by score desc, filters by tag + minScore", () => {
    const s = new CapsuleStore()
    s.register(make("a", 0.9, ["jwt"]))
    s.register(make("b", 0.4, ["jwt"]))
    s.register(make("c", 0.8, ["css"]))
    const results = s.search({ tags: ["jwt"], minScore: 0.5 })
    expect(results.map((c) => c.id)).toEqual(["a"])
  })

  test("export + import roundtrip", () => {
    const s = new CapsuleStore()
    s.register(make("a", 0.7))
    const json = s.exportJson("a")
    const s2 = new CapsuleStore()
    const imported = s2.importJson(json)
    expect(imported.id).toBe("a")
    expect(s2.get("a").feedback.averageScore).toBe(0.7)
  })

  test("import invalid json throws CapsuleImportError", () => {
    const s = new CapsuleStore()
    expect(() => s.importJson("{bad json")).toThrow(CapsuleImportError)
  })

  test("updateFeedback mutates score", () => {
    const s = new CapsuleStore()
    s.register(make("a", null))
    s.updateFeedback("a", (f) => ({
      ...f,
      applications: 1,
      scores: [...f.scores, 0.9],
      averageScore: 0.9,
    }))
    expect(s.get("a").feedback.applications).toBe(1)
  })
})
