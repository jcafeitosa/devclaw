import type { SkillRegistry } from "./registry.ts"
import type { ActivationMatch, Skill } from "./types.ts"

export interface ActivationQuery {
  goal: string
  tags?: string[]
  includeDeprecated?: boolean
  limit?: number
}

const WORD_RE = /[a-z0-9]+/g

function tokenize(text: string): Set<string> {
  const out = new Set<string>()
  for (const match of text.toLowerCase().matchAll(WORD_RE)) {
    if (match[0].length >= 3) out.add(match[0])
  }
  return out
}

function scoreSkill(
  skill: Skill,
  goalTokens: Set<string>,
  queryTags: string[],
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  // trigger match
  for (const trigger of skill.triggers) {
    const triggerTokens = tokenize(trigger)
    for (const t of triggerTokens) {
      if (goalTokens.has(t)) {
        score += 0.5
        reasons.push(`trigger:${trigger}`)
        break
      }
    }
  }
  // tag overlap
  const commonTags = skill.tags.filter((t) => queryTags.includes(t))
  if (commonTags.length > 0) {
    score += 0.4 * commonTags.length
    reasons.push(`tags:${commonTags.join(",")}`)
  }
  // description keyword overlap
  const descTokens = tokenize(skill.description)
  let overlap = 0
  for (const t of descTokens) if (goalTokens.has(t)) overlap++
  if (overlap > 0) {
    score += Math.min(0.3, overlap * 0.05)
    reasons.push(`desc-overlap:${overlap}`)
  }
  return { score, reasons }
}

export class SkillActivator {
  constructor(private readonly registry: SkillRegistry) {}

  activate(query: ActivationQuery): ActivationMatch[] {
    const goalTokens = tokenize(query.goal)
    const tags = query.tags ?? []
    const candidates: ActivationMatch[] = []
    for (const skill of this.registry.list()) {
      if (
        skill.status !== "active" &&
        !(query.includeDeprecated && skill.status === "deprecated")
      ) {
        continue
      }
      const { score, reasons } = scoreSkill(skill, goalTokens, tags)
      if (score <= 0) continue
      if (skill.status === "deprecated") reasons.push("warning:deprecated")
      candidates.push({
        skill: {
          id: skill.id,
          version: skill.version,
          status: skill.status,
          description: skill.description,
          tags: skill.tags,
          triggers: skill.triggers,
          source: skill.source,
          updatedAt: skill.updatedAt,
        },
        score,
        reasons,
      })
    }
    candidates.sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    return candidates.slice(0, query.limit ?? 10)
  }
}
