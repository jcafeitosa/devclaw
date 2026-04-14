import { describe, expect, test } from "bun:test"
import { KnowledgeLifecycle } from "../../src/learning/knowledge_lifecycle.ts"
import { CapsuleStore } from "../../src/learning/store.ts"
import type { IndividualCapsule } from "../../src/learning/types.ts"

function make(
  id: string,
  opts: {
    createdAt?: number
    updatedAt?: number
    applications?: number
    avg?: number | null
    pinned?: boolean
  } = {},
): IndividualCapsule {
  const score = opts.avg ?? null
  return {
    id,
    type: "individual",
    version: "1.0.0",
    createdAt: opts.createdAt ?? 0,
    updatedAt: opts.updatedAt ?? opts.createdAt ?? 0,
    domain: "auth",
    agent: { id: "be" },
    triplet: { instinct: "", experience: "", skill: "" },
    observations: [],
    metadata: { tags: [], toolsUsed: [], skillsUsed: [], durationMs: 0, tokens: 0, costUsd: 0 },
    feedback: {
      applications: opts.applications ?? 0,
      successes: 0,
      failures: 0,
      averageScore: score,
      scores: score === null ? [] : [score],
    },
    pinned: opts.pinned,
  }
}

const NOW = 10_000_000_000
const YEAR = 365 * 24 * 60 * 60 * 1000
const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000

describe("KnowledgeLifecycle", () => {
  test("archives aged-out capsules", () => {
    const store = new CapsuleStore()
    store.register(make("old", { createdAt: NOW - YEAR - 1_000, updatedAt: NOW }))
    store.register(make("young", { createdAt: NOW - 1_000, updatedAt: NOW }))
    const lc = new KnowledgeLifecycle(store)
    const plan = lc.plan({}, NOW)
    expect(plan.archived).toEqual(["old"])
    expect(plan.reasons.get("old")).toBe("aged-out")
  })

  test("archives idle-and-unused", () => {
    const store = new CapsuleStore()
    store.register(
      make("idle", {
        createdAt: NOW - THREE_MONTHS * 2,
        updatedAt: NOW - THREE_MONTHS * 2,
        applications: 0,
      }),
    )
    const lc = new KnowledgeLifecycle(store)
    expect(lc.plan({}, NOW).archived).toEqual(["idle"])
  })

  test("archives low-score-with-enough-feedback", () => {
    const store = new CapsuleStore()
    store.register(
      make("bad", {
        createdAt: NOW,
        updatedAt: NOW,
        applications: 5,
        avg: 0.1,
      }),
    )
    const lc = new KnowledgeLifecycle(store)
    expect(lc.plan({}, NOW).archived).toEqual(["bad"])
  })

  test("pinned protected by default", () => {
    const store = new CapsuleStore()
    store.register(
      make("keep", {
        createdAt: NOW - YEAR - 10,
        updatedAt: NOW - YEAR - 10,
        pinned: true,
      }),
    )
    const lc = new KnowledgeLifecycle(store)
    expect(lc.plan({}, NOW).kept).toContain("keep")
  })

  test("run() mutates store", () => {
    const store = new CapsuleStore()
    store.register(make("bad", { createdAt: NOW, updatedAt: NOW, applications: 5, avg: 0.1 }))
    const lc = new KnowledgeLifecycle(store)
    lc.run({}, NOW)
    expect(store.list()).toEqual([])
  })
})
