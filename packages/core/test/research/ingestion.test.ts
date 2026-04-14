import { describe, expect, test } from "bun:test"
import { chunkText, ingestDocument } from "../../src/research/ingestion.ts"
import type { Document } from "../../src/research/types.ts"

describe("chunkText", () => {
  test("single small paragraph → single chunk", () => {
    expect(chunkText("hello world")).toEqual(["hello world"])
  })

  test("multiple paragraphs stay small enough → single chunk joined", () => {
    const text = "alpha\n\nbeta\n\ngamma"
    expect(chunkText(text, { maxChunkTokens: 1000 })).toEqual([text])
  })

  test("splits into multiple chunks when budget exceeded", () => {
    const para = "x".repeat(2048)
    const chunks = chunkText(`${para}\n\n${para}`, { maxChunkTokens: 200 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  test("paragraph larger than budget gets windowed", () => {
    const huge = "y".repeat(4096)
    const chunks = chunkText(huge, { maxChunkTokens: 128 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(128 * 4)
    }
  })

  test("empty string produces empty chunks array", () => {
    expect(chunkText("")).toEqual([])
  })
})

describe("ingestDocument", () => {
  test("produces chunks with monotonic positions + stable ids", () => {
    const doc: Document = {
      id: "d1",
      sourceId: "src",
      tier: "official-docs",
      title: "t",
      content: "aaa\n\nbbb\n\nccc",
      fetchedAt: 0,
    }
    const chunks = ingestDocument(doc, { maxChunkTokens: 1 })
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.position).toBe(i)
      expect(chunks[i]?.id).toBe(`d1::${i}`)
      expect(chunks[i]?.documentId).toBe("d1")
    }
  })
})
