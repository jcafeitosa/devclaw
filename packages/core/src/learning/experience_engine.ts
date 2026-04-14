import { EventEmitter } from "../util/event_emitter.ts"
import { InvalidCapsuleError } from "./errors.ts"
import type { CapsuleStore } from "./store.ts"
import type { ApplyBundle, Capsule, CapsuleFeedback, IndividualCapsule } from "./types.ts"

export interface ExperienceEngineEventMap extends Record<string, unknown> {
  capsule_created: { capsule: Capsule }
  capsule_applied: { capsuleId: string; bundle: ApplyBundle }
  capsule_feedback: {
    capsuleId: string
    score: number
    notes?: string
    averageScore: number
  }
  capsule_flagged_for_review: { capsuleId: string; averageScore: number }
}

export interface ExperienceEngineConfig {
  store: CapsuleStore
  lowScoreThreshold?: number
}

export interface ApplyOptions {
  taskContext?: Record<string, string>
}

export interface FeedbackOptions {
  score: number
  notes?: string
  outcome?: "success" | "failure"
}

function clamp(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function isIndividual(capsule: Capsule): capsule is IndividualCapsule {
  return capsule.type === "individual"
}

export class ExperienceEngine {
  readonly events = new EventEmitter<ExperienceEngineEventMap>()
  private readonly lowScoreThreshold: number

  constructor(private readonly cfg: ExperienceEngineConfig) {
    this.lowScoreThreshold = cfg.lowScoreThreshold ?? 0.5
  }

  create(capsule: Capsule): Capsule {
    if (!capsule.id || !capsule.type) {
      throw new InvalidCapsuleError(["missing id or type"])
    }
    const stored = this.cfg.store.register(capsule)
    this.events.emit("capsule_created", { capsule: stored })
    return stored
  }

  apply(id: string, _opts: ApplyOptions = {}): ApplyBundle {
    const capsule = this.cfg.store.get(id)
    const bundle: ApplyBundle = isIndividual(capsule)
      ? {
          capsuleId: capsule.id,
          instinct: capsule.triplet.instinct,
          experienceText: capsule.triplet.experience,
          skillHint: capsule.triplet.skill,
          tags: [...capsule.metadata.tags],
          toolsUsed: [...capsule.metadata.toolsUsed],
        }
      : {
          capsuleId: capsule.id,
          instinct: capsule.lessons[0] ?? "",
          experienceText: capsule.lessons.join("\n"),
          skillHint: capsule.handoffPattern,
          tags: [],
          toolsUsed: [],
        }
    this.cfg.store.updateFeedback(id, (f) => ({
      ...f,
      applications: f.applications + 1,
    }))
    this.events.emit("capsule_applied", { capsuleId: id, bundle })
    return bundle
  }

  feedback(id: string, { score, notes: _notes, outcome }: FeedbackOptions): CapsuleFeedback {
    const normalized = clamp(score)
    const updated = this.cfg.store.updateFeedback(id, (f) => {
      const scores = [...f.scores, normalized]
      const avg = scores.reduce((n, s) => n + s, 0) / scores.length
      return {
        applications: f.applications,
        successes: f.successes + (outcome === "success" ? 1 : 0),
        failures: f.failures + (outcome === "failure" ? 1 : 0),
        averageScore: avg,
        scores,
      }
    }).feedback
    this.events.emit("capsule_feedback", {
      capsuleId: id,
      score: normalized,
      averageScore: updated.averageScore ?? normalized,
    })
    if ((updated.averageScore ?? 0) < this.lowScoreThreshold) {
      this.events.emit("capsule_flagged_for_review", {
        capsuleId: id,
        averageScore: updated.averageScore ?? 0,
      })
    }
    return updated
  }
}
