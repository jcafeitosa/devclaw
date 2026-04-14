import { describe, expect, test } from "bun:test"
import { CheckpointNotFoundError } from "../../src/checkpoint/errors.ts"
import { InMemoryCheckpointStore } from "../../src/checkpoint/store.ts"
import type { Checkpoint } from "../../src/checkpoint/types.ts"

function mkCheckpoint(id: string, at: number, pinned = false): Checkpoint {
  return {
    id,
    name: id,
    sha: `sha-${id}`,
    trigger: "manual",
    createdAt: at,
    pinned,
  }
}

describe("InMemoryCheckpointStore", () => {
  test("save + get + list (sorted desc by createdAt)", async () => {
    const s = new InMemoryCheckpointStore()
    await s.save(mkCheckpoint("a", 100))
    await s.save(mkCheckpoint("b", 300))
    await s.save(mkCheckpoint("c", 200))
    expect((await s.get("a")).sha).toBe("sha-a")
    expect((await s.list()).map((c) => c.id)).toEqual(["b", "c", "a"])
  })

  test("get unknown throws CheckpointNotFoundError", async () => {
    const s = new InMemoryCheckpointStore()
    await expect(s.get("missing")).rejects.toBeInstanceOf(CheckpointNotFoundError)
  })

  test("prune moves beyond-hot to cold, purges beyond-cold", async () => {
    const s = new InMemoryCheckpointStore()
    for (let i = 0; i < 10; i++) {
      await s.save(mkCheckpoint(`c${i}`, i * 100))
    }
    const { cold, purged } = await s.prune({
      hotLimit: 3,
      coldLimit: 7,
      pinnedAlwaysKept: true,
    })
    expect(cold.length).toBe(4)
    expect(purged.length).toBe(3)
    expect((await s.list()).length).toBe(7)
  })

  test("pinned always kept regardless of retention", async () => {
    const s = new InMemoryCheckpointStore()
    await s.save(mkCheckpoint("keep", 0, true))
    for (let i = 0; i < 20; i++) {
      await s.save(mkCheckpoint(`c${i}`, i + 1))
    }
    await s.prune({ hotLimit: 2, coldLimit: 4, pinnedAlwaysKept: true })
    expect((await s.list()).some((c) => c.id === "keep")).toBe(true)
  })

  test("isCold flag after prune", async () => {
    const s = new InMemoryCheckpointStore()
    for (let i = 0; i < 5; i++) await s.save(mkCheckpoint(`c${i}`, i))
    await s.prune({ hotLimit: 2, coldLimit: 5, pinnedAlwaysKept: true })
    expect(s.isCold("c0")).toBe(true)
    expect(s.isCold("c4")).toBe(false)
  })

  test("delete removes checkpoint", async () => {
    const s = new InMemoryCheckpointStore()
    await s.save(mkCheckpoint("c", 1))
    await s.delete("c")
    await expect(s.get("c")).rejects.toBeInstanceOf(CheckpointNotFoundError)
  })
})
