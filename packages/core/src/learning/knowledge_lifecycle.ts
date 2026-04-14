import type { CapsuleStore } from "./store.ts"
import type { Capsule } from "./types.ts"

export interface LifecyclePolicy {
  maxAgeMs?: number
  maxIdleMs?: number
  minAverageScore?: number
  minApplications?: number
  protectPinned?: boolean
}

export interface LifecycleResult {
  archived: string[]
  kept: string[]
  reasons: Map<string, string>
}

const DEFAULT_POLICY: Required<LifecyclePolicy> = {
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
  maxIdleMs: 90 * 24 * 60 * 60 * 1000,
  minAverageScore: 0.4,
  minApplications: 1,
  protectPinned: true,
}

function shouldArchive(
  capsule: Capsule,
  policy: Required<LifecyclePolicy>,
  now: number,
): string | null {
  if (policy.protectPinned && capsule.pinned) return null
  const age = now - capsule.createdAt
  if (age > policy.maxAgeMs) return "aged-out"
  const idle = now - capsule.updatedAt
  if (idle > policy.maxIdleMs && capsule.feedback.applications < policy.minApplications) {
    return "idle-and-unused"
  }
  if (
    capsule.feedback.applications >= policy.minApplications &&
    (capsule.feedback.averageScore ?? 0) < policy.minAverageScore
  ) {
    return "low-score-with-enough-feedback"
  }
  return null
}

export class KnowledgeLifecycle {
  constructor(private readonly store: CapsuleStore) {}

  plan(policy: LifecyclePolicy = {}, now: number = Date.now()): LifecycleResult {
    const effective = { ...DEFAULT_POLICY, ...policy }
    const archived: string[] = []
    const kept: string[] = []
    const reasons = new Map<string, string>()
    for (const capsule of this.store.list()) {
      const reason = shouldArchive(capsule, effective, now)
      if (reason) {
        archived.push(capsule.id)
        reasons.set(capsule.id, reason)
      } else {
        kept.push(capsule.id)
      }
    }
    return { archived, kept, reasons }
  }

  run(policy: LifecyclePolicy = {}, now: number = Date.now()): LifecycleResult {
    const plan = this.plan(policy, now)
    for (const id of plan.archived) {
      this.store.delete(id)
    }
    return plan
  }
}
