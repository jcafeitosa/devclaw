import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { WorkItemStore } from "../../src/work/store.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("WorkItemStore sqlite", () => {
  test("persists items across store instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-work-store-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "work.db")
    const first = new WorkItemStore({ sqlitePath })
    const created = first.create({ kind: "task", title: "persisted task", tags: ["x"] })

    const second = new WorkItemStore({ sqlitePath })
    expect(second.get(created.id).title).toBe("persisted task")
    expect(second.byKind("task")).toHaveLength(1)
  })
})
