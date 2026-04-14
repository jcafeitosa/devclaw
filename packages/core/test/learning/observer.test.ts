import { describe, expect, test } from "bun:test"
import { InvalidCapsuleError } from "../../src/learning/errors.ts"
import { Observer } from "../../src/learning/observer.ts"

describe("Observer", () => {
  test("records events + finalizes into ECAP", () => {
    const o = new Observer({ agentId: "be", domain: "auth" })
    o.record("started")
    o.recordTool("fs_read", 0.01, 100, 50)
    o.recordSkill("jwt_validation")
    o.tagWith("jwt")
    o.setTriplet({
      instinct: "Validate before parsing",
      experience: "Saw 3 failures",
      skill: "Check exp first",
    })
    const ecap = o.finalize({ id: "ecap_1" })
    expect(ecap.type).toBe("individual")
    expect(ecap.domain).toBe("auth")
    expect(ecap.metadata.tags).toContain("jwt")
    expect(ecap.metadata.toolsUsed).toContain("fs_read")
    expect(ecap.metadata.skillsUsed).toContain("jwt_validation")
    expect(ecap.metadata.costUsd).toBeCloseTo(0.01, 5)
    expect(ecap.observations.length).toBeGreaterThanOrEqual(3)
    expect(ecap.feedback.applications).toBe(0)
  })

  test("empty triplet + no observations → InvalidCapsuleError", () => {
    const o = new Observer({ agentId: "x", domain: "misc" })
    expect(() => o.finalize({ id: "bad" })).toThrow(InvalidCapsuleError)
  })

  test("preset triplet via initial config", () => {
    const o = new Observer({
      agentId: "x",
      domain: "m",
      triplet: { instinct: "pre", experience: "", skill: "" },
    })
    o.record("e")
    expect(o.finalize({ id: "c" }).triplet.instinct).toBe("pre")
  })

  test("version override respected", () => {
    const o = new Observer({ agentId: "x", domain: "m" })
    o.record("e")
    o.setTriplet({ instinct: "x" })
    expect(o.finalize({ id: "c", version: "2.1.0" }).version).toBe("2.1.0")
  })
})
