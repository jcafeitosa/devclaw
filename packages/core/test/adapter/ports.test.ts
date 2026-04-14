import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { MemoryBlobAdapter } from "../../src/adapter/blob.ts"
import { AdapterRegistry } from "../../src/adapter/registry.ts"
import { MemoryStorage } from "../../src/adapter/storage.ts"
import { MemoryVectorAdapter, SqliteVectorAdapter } from "../../src/adapter/vector.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("MemoryStorage", () => {
  test("executes basic relational flow", async () => {
    const store = new MemoryStorage()
    await store.execute("CREATE TABLE IF NOT EXISTS work_items (id TEXT, title TEXT)")
    await store.execute("INSERT INTO work_items (id, title) VALUES (?, ?)", ["w1", "Ship A-01"])
    await store.execute("INSERT OR REPLACE INTO work_items (id, title) VALUES (?, ?)", ["w1", "Ship ADR-020"])

    const rows = await store.query<{ id: string; title: string }>(
      "SELECT id, title FROM work_items WHERE id = ?",
      ["w1"],
    )

    expect(rows).toEqual([{ id: "w1", title: "Ship ADR-020" }])
  })

  test("rolls back transaction on error", async () => {
    const store = new MemoryStorage()
    await store.execute("CREATE TABLE IF NOT EXISTS checkpoints (id TEXT, payload TEXT)")

    await expect(
      store.transaction(async (tx) => {
        await tx.execute("INSERT INTO checkpoints (id, payload) VALUES (?, ?)", ["c1", "{}"])
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    const rows = await store.query("SELECT * FROM checkpoints")
    expect(rows).toEqual([])
  })
})

describe("MemoryVectorAdapter", () => {
  test("upserts, filters and ranks vectors", async () => {
    const vector = new MemoryVectorAdapter()
    await vector.upsert([
      { id: "a", vector: new Float32Array([1, 0]), metadata: { kind: "db", tags: ["core"] } },
      { id: "b", vector: new Float32Array([0, 1]), metadata: { kind: "ui", tags: ["docs"] } },
      { id: "c", vector: new Float32Array([0.8, 0.2]), metadata: { kind: "db", tags: ["core"] } },
    ])

    const hits = await vector.query(new Float32Array([1, 0]), {
      topK: 2,
      filter: { kind: "db", tags: ["core"] },
    })

    expect(hits.map((hit) => hit.id)).toEqual(["a", "c"])
    expect(hits[0]?.score).toBeGreaterThanOrEqual(hits[1]?.score ?? 0)
  })

  test("refreshes indexes when the same id is upserted again", async () => {
    const vector = new MemoryVectorAdapter()
    await vector.upsert([{ id: "a", vector: new Float32Array([1, 0]), metadata: { kind: "db", tags: ["core"] } }])
    await vector.upsert([{ id: "a", vector: new Float32Array([0, 1]), metadata: { kind: "ui", tags: ["docs"] } }])

    const oldHits = await vector.query(new Float32Array([1, 0]), {
      topK: 1,
      filter: { kind: "db", tags: ["core"] },
    })
    const newHits = await vector.query(new Float32Array([0, 1]), {
      topK: 1,
      filter: { kind: "ui", tags: ["docs"] },
    })

    expect(oldHits).toEqual([])
    expect(newHits.map((hit) => hit.id)).toEqual(["a"])
  })

  test("deletes vectors and reports size", async () => {
    const vector = new MemoryVectorAdapter()
    await vector.upsert([{ id: "a", vector: new Float32Array([1, 0]) }])
    expect(await vector.size()).toBe(1)
    await vector.delete(["a"])
    expect(await vector.size()).toBe(0)
  })
})

describe("SqliteVectorAdapter", () => {
  test("persists, filters and ranks vectors across instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-vector-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "vectors.db")

    const first = new SqliteVectorAdapter({ sqlitePath })
    await first.upsert([
      { id: "a", vector: new Float32Array([1, 0]), metadata: { kind: "db", tags: ["core"] } },
      { id: "b", vector: new Float32Array([0, 1]), metadata: { kind: "ui", tags: ["docs"] } },
      { id: "c", vector: new Float32Array([0.8, 0.2]), metadata: { kind: "db", tags: ["core"] } },
    ])

    const second = new SqliteVectorAdapter({ sqlitePath })
    expect(await second.size()).toBe(3)
    const hits = await second.query(new Float32Array([1, 0]), {
      topK: 2,
      filter: { kind: "db", tags: ["core"] },
    })

    expect(hits.map((hit) => hit.id)).toEqual(["a", "c"])
    expect(hits[0]?.score).toBeGreaterThanOrEqual(hits[1]?.score ?? 0)
  })

  test("refreshes indexes when the same id is replaced", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-vector-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "vectors.db")

    const vector = new SqliteVectorAdapter({ sqlitePath })
    await vector.upsert([{ id: "a", vector: new Float32Array([1, 0]), metadata: { kind: "db", tags: ["core"] } }])
    await vector.upsert([{ id: "a", vector: new Float32Array([0, 1]), metadata: { kind: "ui", tags: ["docs"] } }])

    const oldHits = await vector.query(new Float32Array([1, 0]), {
      topK: 1,
      filter: { kind: "db", tags: ["core"] },
    })
    const newHits = await vector.query(new Float32Array([0, 1]), {
      topK: 1,
      filter: { kind: "ui", tags: ["docs"] },
    })

    expect(oldHits).toEqual([])
    expect(newHits.map((hit) => hit.id)).toEqual(["a"])
  })

  test("deletes persisted vectors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-vector-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "vectors.db")

    const vector = new SqliteVectorAdapter({ sqlitePath })
    await vector.upsert([{ id: "a", vector: new Float32Array([1, 0]) }])
    expect(await vector.size()).toBe(1)
    await vector.delete(["a"])
    expect(await vector.size()).toBe(0)

    const reopened = new SqliteVectorAdapter({ sqlitePath })
    expect(await reopened.size()).toBe(0)
  })
})

describe("MemoryBlobAdapter", () => {
  test("stores, lists and removes blobs", async () => {
    const blob = new MemoryBlobAdapter()
    await blob.put("sessions/a.txt", "alpha", { contentType: "text/plain" })
    await blob.put("sessions/b.txt", "beta")

    const seen: string[] = []
    for await (const key of blob.list("sessions/")) seen.push(key)

    const data = await blob.get("sessions/a.txt")
    expect(new TextDecoder().decode(data ? new Uint8Array(data) : undefined)).toBe("alpha")
    expect(seen).toEqual(["sessions/a.txt", "sessions/b.txt"])

    await blob.delete("sessions/a.txt")
    expect(await blob.get("sessions/a.txt")).toBeNull()
  })
})

describe("AdapterRegistry", () => {
  test("registers and resolves adapters by domain", () => {
    const registry = new AdapterRegistry()
    const storage = new MemoryStorage()
    const vector = new MemoryVectorAdapter()

    registry.register("storage", storage)
    registry.register("vector", vector)

    expect(registry.get("storage")).toBe(storage)
    expect(registry.get("vector")).toBe(vector)
  })

  test("throws when a required adapter is missing", () => {
    const registry = new AdapterRegistry()
    expect(() => registry.get("blob")).toThrow("blob")
  })
})
