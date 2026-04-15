import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { CapsuleStore } from "../../src/learning/store.ts"
import type { IndividualCapsule } from "../../src/learning/types.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

function makeCapsule(id: string): IndividualCapsule {
  return {
    id,
    type: "individual",
    version: "1.0.0",
    createdAt: 0,
    updatedAt: 0,
    domain: "auth",
    agent: { id: "agent-1" },
    triplet: { instinct: "i", experience: "e", skill: "s" },
    observations: [],
    metadata: {
      tags: ["jwt"],
      toolsUsed: [],
      skillsUsed: [],
      durationMs: 0,
      tokens: 0,
      costUsd: 0,
    },
    feedback: { applications: 0, successes: 0, failures: 0, averageScore: 0.8, scores: [0.8] },
  }
}

describe("CapsuleStore sqlite", () => {
  test("persists capsules across store instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-learning-store-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "learning.db")
    const first = new CapsuleStore({ sqlitePath })
    first.register(makeCapsule("cap-1"))

    const second = new CapsuleStore({ sqlitePath })
    expect(second.get("cap-1").domain).toBe("auth")
    expect(second.search({ tags: ["jwt"] }).map((item) => item.id)).toEqual(["cap-1"])
  })
})
