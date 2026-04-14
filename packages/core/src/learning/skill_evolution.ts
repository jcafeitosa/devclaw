import type { Skill } from "../skill/types.ts"
import { NotReadyForPromotionError } from "./errors.ts"
import type { CapsuleStore } from "./store.ts"
import type { IndividualCapsule } from "./types.ts"

export interface PromoteConfig {
  minScore?: number
  minApplications?: number
}

export interface SkillEvolutionConfig {
  store: CapsuleStore
  promote?: PromoteConfig
}

export class SkillEvolution {
  private readonly minScore: number
  private readonly minApplications: number

  constructor(private readonly cfg: SkillEvolutionConfig) {
    this.minScore = cfg.promote?.minScore ?? 0.75
    this.minApplications = cfg.promote?.minApplications ?? 3
  }

  isReady(id: string): { ready: boolean; reasons: string[] } {
    const capsule = this.cfg.store.get(id) as IndividualCapsule
    const reasons: string[] = []
    if (capsule.type !== "individual") reasons.push("only individual capsules promote")
    const score = capsule.feedback.averageScore ?? 0
    if (score < this.minScore) {
      reasons.push(`score ${score.toFixed(2)} < ${this.minScore}`)
    }
    if (capsule.feedback.applications < this.minApplications) {
      reasons.push(`applications ${capsule.feedback.applications} < ${this.minApplications}`)
    }
    return { ready: reasons.length === 0, reasons }
  }

  promote(id: string): Skill {
    const { ready, reasons } = this.isReady(id)
    if (!ready) throw new NotReadyForPromotionError(id, reasons)
    const capsule = this.cfg.store.get(id) as IndividualCapsule
    const skillId =
      capsule.triplet.skill
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || `skill-${capsule.id}`
    const now = Date.now()
    const skill: Skill = {
      id: skillId,
      version: "1.0.0",
      status: "review",
      description: capsule.triplet.instinct || capsule.triplet.skill,
      body: `# From capsule ${capsule.id}\n\n${capsule.triplet.experience}\n\nApplication: ${capsule.triplet.skill}`,
      tags: ["auto-evolved", ...capsule.metadata.tags],
      triggers: [...capsule.metadata.tags],
      inputs: [],
      steps: [],
      contextRequirements: [],
      tools: [...capsule.metadata.toolsUsed],
      constraints: undefined,
      outputSchema: undefined,
      author: capsule.agent.id,
      source: `capsule:${capsule.id}`,
      updatedAt: now,
    }
    return skill
  }
}
