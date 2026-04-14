import { describe, expect, test } from "bun:test"
import { cosineSimilarity, HashEmbedder } from "../../src/memory/embedding.ts"

describe("cosineSimilarity", () => {
  test("identical vectors → 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5)
  })

  test("orthogonal vectors → 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  test("opposite vectors → -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5)
  })

  test("zero vector returns 0 (no division by zero)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })

  test("mismatched dimensions throw", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension/i)
  })
})

describe("HashEmbedder", () => {
  const embedder = new HashEmbedder({ dim: 384 })

  test("produces vector of configured dimension", async () => {
    const v = await embedder.embed("hello world")
    expect(v).toHaveLength(384)
  })

  test("deterministic for same input", async () => {
    const a = await embedder.embed("deterministic")
    const b = await embedder.embed("deterministic")
    expect(a).toEqual(b)
  })

  test("different text produces different vector", async () => {
    const a = await embedder.embed("apple orange")
    const b = await embedder.embed("car engine")
    expect(cosineSimilarity(a, b)).toBeLessThan(0.9)
  })

  test("similar text has higher cosine than unrelated", async () => {
    const base = await embedder.embed("postgres schema migration")
    const similar = await embedder.embed("postgres migration plan")
    const unrelated = await embedder.embed("cooking recipes")
    expect(cosineSimilarity(base, similar)).toBeGreaterThan(cosineSimilarity(base, unrelated))
  })

  test("empty string returns zero-ish vector", async () => {
    const v = await embedder.embed("")
    const zero = new Array(384).fill(0)
    expect(v).toEqual(zero)
  })
})
