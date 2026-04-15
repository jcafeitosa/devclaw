import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { InMemoryCheckpointStore } from "../../src/checkpoint/store.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("CheckpointStore sqlite", () => {
  test("persists checkpoints and cold state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-checkpoint-store-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "checkpoint.db")
    const first = new InMemoryCheckpointStore({ sqlitePath })
    await first.save({
      id: "c1",
      name: "one",
      sha: "sha-c1",
      trigger: "manual",
      createdAt: 1,
    })
    await first.save({
      id: "c2",
      name: "two",
      sha: "sha-c2",
      trigger: "manual",
      createdAt: 2,
    })
    await first.prune({ hotLimit: 1, coldLimit: 2, pinnedAlwaysKept: true })

    const second = new InMemoryCheckpointStore({ sqlitePath })
    expect((await second.list()).map((item) => item.id)).toEqual(["c2", "c1"])
    expect(second.isCold("c1")).toBe(true)
  })
})
