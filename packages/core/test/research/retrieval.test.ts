import { describe, expect, test } from "bun:test"
import { rankDocuments } from "../../src/research/retrieval.ts"
import type { Document, Query } from "../../src/research/types.ts"

function doc(
  id: string,
  title: string,
  tier: Document["tier"],
  content = "lorem ipsum postgres",
  fetchedAt = Date.now(),
): Document {
  return { id, sourceId: "s", tier, title, content, fetchedAt }
}

const query: Query = { text: "postgres schema migration" }

describe("rankDocuments", () => {
  test("ranks higher-authority tier ahead when content overlap similar", () => {
    const results = rankDocuments(query, [
      doc("a", "random blog post", "blog"),
      doc("b", "official postgres migration docs", "official-docs"),
    ])
    expect(results[0]?.id).toBe("b")
  })

  test("relevance boosts matching titles", () => {
    const results = rankDocuments(query, [
      doc("hit", "postgres migration how-to", "blog"),
      doc("miss", "react tutorial", "official-docs", "react hooks"),
    ])
    expect(results[0]?.id).toBe("hit")
  })

  test("freshness: newer doc wins among same tier and relevance", () => {
    const now = Date.now()
    const results = rankDocuments(
      query,
      [
        doc("old", "postgres schema docs", "blog", "postgres migration", now - 180 * 86_400_000),
        doc("new", "postgres schema docs", "blog", "postgres migration", now - 1 * 86_400_000),
      ],
      { now },
    )
    expect(results[0]?.id).toBe("new")
  })

  test("tiers filter narrows allowed sources", () => {
    const results = rankDocuments({ ...query, tiers: ["official-docs"] }, [
      doc("a", "postgres docs", "blog"),
      doc("b", "postgres docs", "official-docs"),
    ])
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe("b")
  })

  test("minScore drops low-scoring results", () => {
    const results = rankDocuments(query, [doc("noise", "unrelated content", "llm", "off topic")], {
      minScore: 0.5,
    })
    expect(results).toEqual([])
  })

  test("limit caps result count", () => {
    const docs = Array.from({ length: 10 }, (_, i) => doc(`d${i}`, "postgres migration", "blog"))
    expect(rankDocuments(query, docs, { limit: 3 })).toHaveLength(3)
  })
})
