import { SkillNotFoundError } from "./errors.ts"
import type { SkillRegistry } from "./registry.ts"
import type { Skill, SkillMetadata } from "./types.ts"

export interface ExpandedSkill {
  metadata: SkillMetadata
  body: string
  steps: string[]
  inputs: Skill["inputs"]
  tools: string[]
  constraints?: Skill["constraints"]
  outputSchema?: Skill["outputSchema"]
  contextRequirements: string[]
}

export class ProgressiveLoader {
  private readonly cache = new Map<string, ExpandedSkill>()

  constructor(private readonly registry: SkillRegistry) {}

  listMetadata(): SkillMetadata[] {
    return this.registry.metadata()
  }

  metadata(id: string, version?: string): SkillMetadata {
    const skill = this.registry.get(id, version)
    return toMetadata(skill)
  }

  expand(id: string, version?: string): ExpandedSkill {
    const skill = this.registry.get(id, version)
    const key = `${skill.id}@${skill.version}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const expanded: ExpandedSkill = {
      metadata: toMetadata(skill),
      body: skill.body,
      steps: [...skill.steps],
      inputs: skill.inputs.map((i) => ({ ...i })),
      tools: [...skill.tools],
      constraints: skill.constraints,
      outputSchema: skill.outputSchema,
      contextRequirements: [...skill.contextRequirements],
    }
    this.cache.set(key, expanded)
    return expanded
  }

  invalidate(id: string, version?: string): void {
    if (version) {
      this.cache.delete(`${id}@${version}`)
      return
    }
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${id}@`)) this.cache.delete(key)
    }
  }

  has(id: string, version?: string): boolean {
    try {
      this.registry.get(id, version)
      return true
    } catch (err) {
      if (err instanceof SkillNotFoundError) return false
      throw err
    }
  }
}

function toMetadata(skill: Skill): SkillMetadata {
  return {
    id: skill.id,
    version: skill.version,
    status: skill.status,
    description: skill.description,
    tags: skill.tags,
    triggers: skill.triggers,
    source: skill.source,
    updatedAt: skill.updatedAt,
  }
}
