import { InvalidCapsuleError } from "./errors.ts"
import type { CapsuleMetadata, IndividualCapsule, Observation, Triplet } from "./types.ts"

export interface ObserverInitial {
  agentId: string
  agentModel?: string
  domain: string
  taskContext?: Record<string, string>
  triplet?: Partial<Triplet>
  source?: string
}

export class Observer {
  private readonly agentId: string
  private readonly agentModel?: string
  private readonly domain: string
  private readonly taskContext?: Record<string, string>
  private readonly observations: Observation[] = []
  private triplet: Triplet = { instinct: "", experience: "", skill: "" }
  private readonly tags = new Set<string>()
  private readonly toolsUsed = new Set<string>()
  private readonly skillsUsed = new Set<string>()
  private totalCostUsd = 0
  private totalTokens = 0
  private totalDurationMs = 0
  private readonly startedAt = performance.now()
  private readonly source?: string

  constructor(init: ObserverInitial) {
    this.agentId = init.agentId
    this.agentModel = init.agentModel
    this.domain = init.domain
    this.taskContext = init.taskContext
    this.source = init.source
    if (init.triplet) this.triplet = { ...this.triplet, ...init.triplet }
  }

  record(event: string, data?: Record<string, unknown>): void {
    this.observations.push({ at: Date.now(), event, data })
  }

  tagWith(tag: string): void {
    this.tags.add(tag)
  }

  recordTool(tool: string, costUsd?: number, tokens?: number, durationMs?: number): void {
    this.toolsUsed.add(tool)
    this.record("tool_call", {
      tool,
      costUsd,
      tokens,
      durationMs,
    })
    if (costUsd) this.totalCostUsd += costUsd
    if (tokens) this.totalTokens += tokens
    if (durationMs) this.totalDurationMs += durationMs
  }

  recordSkill(skillId: string): void {
    this.skillsUsed.add(skillId)
    this.record("skill_use", { skillId })
  }

  setTriplet(patch: Partial<Triplet>): void {
    this.triplet = { ...this.triplet, ...patch }
  }

  finalize(
    opts: { id: string } & Partial<Pick<IndividualCapsule, "version" | "pinned">>,
  ): IndividualCapsule {
    const issues: string[] = []
    if (!this.triplet.instinct && !this.triplet.experience && !this.triplet.skill) {
      issues.push("triplet is empty")
    }
    if (this.observations.length === 0) issues.push("no observations recorded")
    if (issues.length > 0) throw new InvalidCapsuleError(issues)

    const metadata: CapsuleMetadata = {
      tags: [...this.tags],
      toolsUsed: [...this.toolsUsed],
      skillsUsed: [...this.skillsUsed],
      durationMs:
        this.totalDurationMs > 0 ? this.totalDurationMs : performance.now() - this.startedAt,
      tokens: this.totalTokens,
      costUsd: this.totalCostUsd,
    }
    const now = Date.now()
    return {
      id: opts.id,
      type: "individual",
      version: opts.version ?? "1.0.0",
      createdAt: now,
      updatedAt: now,
      domain: this.domain,
      agent: { id: this.agentId, model: this.agentModel },
      taskContext: this.taskContext,
      triplet: { ...this.triplet },
      observations: [...this.observations],
      metadata,
      feedback: {
        applications: 0,
        successes: 0,
        failures: 0,
        averageScore: null,
        scores: [],
      },
      pinned: opts.pinned,
      source: this.source,
    }
  }
}
