import { describe, expect, test } from "bun:test"
import { collab, cooperate, debate, delegate, modeForPhase } from "../../src/team/interaction.ts"

describe("interaction helpers", () => {
  test("debate tags mode='debate' and fills at/payload", () => {
    const i = debate({ from: "architect", to: "security", topic: "threat model" })
    expect(i.mode).toBe("debate")
    expect(i.from).toBe("architect")
    expect(typeof i.at).toBe("number")
  })

  test("collab sets mode='collab'", () => {
    expect(collab({ from: "backend", to: "frontend", topic: "api contract" }).mode).toBe("collab")
  })

  test("cooperate sets mode='cooperate'", () => {
    expect(cooperate({ from: "qa", to: "sre", topic: "deploy" }).mode).toBe("cooperate")
  })

  test("delegate sets mode='delegate' and supports multi-target", () => {
    const i = delegate({
      from: "coordinator",
      to: ["backend", "frontend"],
      topic: "build",
    })
    expect(i.mode).toBe("delegate")
    expect(Array.isArray(i.to)).toBe(true)
  })
})

describe("modeForPhase", () => {
  test("maps SDLC phases to modes per vault", () => {
    expect(modeForPhase("design-doc")).toBe("debate")
    expect(modeForPhase("planning")).toBe("delegate")
    expect(modeForPhase("development")).toBe("collab")
    expect(modeForPhase("deploy")).toBe("cooperate")
  })

  test("unknown phases default to collab", () => {
    expect(modeForPhase("unknown-phase")).toBe("collab")
  })
})
