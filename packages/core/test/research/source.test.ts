import { describe, expect, test } from "bun:test"
import { SourceFailedError } from "../../src/research/errors.ts"
import { AggregateSource, HttpSource, StaticSource } from "../../src/research/source.ts"
import type { Document } from "../../src/research/types.ts"

function doc(id: string, content: string): Document {
  return {
    id,
    sourceId: "x",
    tier: "official-docs",
    title: content.slice(0, 20),
    content,
    fetchedAt: 0,
  }
}

describe("StaticSource", () => {
  test("default matcher filters by content keyword", async () => {
    const src = new StaticSource({
      id: "docs",
      tier: "official-docs",
      documents: [doc("a", "postgres migration guide"), doc("b", "react hooks")],
    })
    const results = await src.search({ text: "postgres" })
    expect(results.map((d) => d.id)).toEqual(["a"])
  })

  test("custom matcher applied", async () => {
    const src = new StaticSource({
      id: "docs",
      tier: "official-docs",
      documents: [doc("a", "x"), doc("b", "y")],
      matcher: (d) => d.id === "b",
    })
    expect((await src.search({ text: "" })).map((d) => d.id)).toEqual(["b"])
  })
})

describe("HttpSource", () => {
  test("wraps fetch errors into SourceFailedError", async () => {
    const src = new HttpSource({
      id: "gh",
      tier: "github",
      fetch: async () => {
        throw new Error("timeout")
      },
    })
    await expect(src.search({ text: "x" })).rejects.toBeInstanceOf(SourceFailedError)
  })

  test("returns documents from injected fetcher", async () => {
    const src = new HttpSource({
      id: "gh",
      tier: "github",
      fetch: async () => [doc("a", "found")],
    })
    expect((await src.search({ text: "x" })).map((d) => d.id)).toEqual(["a"])
  })
})

describe("AggregateSource", () => {
  test("merges docs from all children; isolates errors", async () => {
    const ok = new HttpSource({
      id: "ok",
      tier: "official-docs",
      fetch: async () => [doc("a", "hit")],
    })
    const bad = new HttpSource({
      id: "bad",
      tier: "search",
      fetch: async () => {
        throw new Error("down")
      },
    })
    const agg = new AggregateSource({
      id: "agg",
      tier: "search",
      children: [ok, bad],
    })
    const { documents, errors } = await agg.search({ text: "q" })
    expect(documents.map((d) => d.id)).toEqual(["a"])
    expect(errors[0]?.sourceId).toBe("bad")
  })

  test("continueOnError=false rethrows", async () => {
    const bad = new HttpSource({
      id: "bad",
      tier: "search",
      fetch: async () => {
        throw new Error("oops")
      },
    })
    const agg = new AggregateSource({
      id: "agg",
      tier: "search",
      children: [bad],
      continueOnError: false,
    })
    await expect(agg.search({ text: "x" })).rejects.toBeInstanceOf(SourceFailedError)
  })
})
