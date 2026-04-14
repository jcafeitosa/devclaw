import { describe, expect, test } from "bun:test"
import { ResearchEngine } from "../../src/research/engine.ts"
import { NoResultsError, ResearchBudgetExceededError } from "../../src/research/errors.ts"
import { StaticSource } from "../../src/research/source.ts"
import type { Document } from "../../src/research/types.ts"

function doc(
  id: string,
  title: string,
  content: string,
  tier: Document["tier"] = "official-docs",
): Document {
  return { id, sourceId: "src", tier, title, content, fetchedAt: Date.now() }
}

describe("ResearchEngine", () => {
  test("returns citations + summary", async () => {
    const src = new StaticSource({
      id: "docs",
      tier: "official-docs",
      documents: [doc("a", "postgres docs", "postgres migration strategy")],
    })
    const engine = new ResearchEngine({ sources: [src] })
    const answer = await engine.ask({ text: "postgres migration" })
    expect(answer.citations).toHaveLength(1)
    expect(answer.summary).toContain("postgres")
    expect(answer.fromCache).toBe(false)
  })

  test("second identical query hits cache", async () => {
    let calls = 0
    const src = {
      id: "gh",
      tier: "github" as const,
      async search() {
        calls++
        return [doc("a", "postgres", "postgres migration")]
      },
    }
    const engine = new ResearchEngine({ sources: [src] })
    await engine.ask({ text: "postgres migration" })
    await engine.ask({ text: "postgres migration" })
    expect(calls).toBe(1)
  })

  test("budget exceeded throws", async () => {
    const tiers = ["official-docs", "github", "stackoverflow", "blog", "paper"] as const
    const sources = tiers.map((tier, i) => ({
      id: `s${i}`,
      tier,
      async search() {
        return [doc(`d${i}`, "postgres migration", "content postgres migration", tier)]
      },
    }))
    const engine = new ResearchEngine({
      sources,
      budget: { maxCallsPerTask: 2 },
    })
    await expect(engine.ask({ text: "postgres migration" })).rejects.toBeInstanceOf(
      ResearchBudgetExceededError,
    )
  })

  test("no results → NoResultsError", async () => {
    const src = new StaticSource({
      id: "docs",
      tier: "official-docs",
      documents: [doc("a", "unrelated", "cooking recipes")],
    })
    const engine = new ResearchEngine({ sources: [src] })
    await expect(engine.ask({ text: "postgres" })).rejects.toBeInstanceOf(NoResultsError)
  })

  test("custom synthesizer invoked with ranked docs", async () => {
    let received = 0
    const src = new StaticSource({
      id: "docs",
      tier: "official-docs",
      documents: [doc("a", "postgres", "postgres migration")],
    })
    const engine = new ResearchEngine({
      sources: [src],
      synthesize: (_q, results) => {
        received = results.length
        return "custom summary"
      },
    })
    const answer = await engine.ask({ text: "postgres migration" })
    expect(received).toBeGreaterThan(0)
    expect(answer.summary).toBe("custom summary")
  })
})
