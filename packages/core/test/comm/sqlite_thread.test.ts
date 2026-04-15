import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ThreadStore } from "../../src/comm/thread.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("ThreadStore sqlite", () => {
  test("persists thread lifecycle across store instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-thread-store-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "thread.db")
    const first = new ThreadStore({ sqlitePath })
    const created = first.create({
      channelId: "ch-1",
      title: "persisted thread",
      openedBy: "agent-1",
      links: { projectId: "proj-1" },
    })
    first.close(created.id, "agent-1", "done")

    const second = new ThreadStore({ sqlitePath })
    const loaded = second.get(created.id)
    expect(loaded.open).toBe(false)
    expect(loaded.closedReason).toBe("done")
    expect(second.listByChannel("ch-1")).toHaveLength(1)
  })
})
