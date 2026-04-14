import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { SkillNotFoundError, SkillTransitionError } from "./errors.ts"
import { parseSkillMarkdown } from "./parser.ts"
import type { Skill, SkillMetadata, SkillStatus } from "./types.ts"

const VALID_TRANSITIONS: Record<SkillStatus, SkillStatus[]> = {
  draft: ["review", "archived"],
  review: ["active", "draft", "archived"],
  active: ["deprecated", "archived"],
  deprecated: ["active", "archived"],
  archived: [],
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na - nb
  }
  return 0
}

export interface SkillLoadFromDirResult {
  loaded: Skill[]
  errors: Array<{ file: string; error: string }>
}

export class SkillRegistry {
  private readonly byId = new Map<string, Map<string, Skill>>()

  register(skill: Skill): void {
    let versions = this.byId.get(skill.id)
    if (!versions) {
      versions = new Map()
      this.byId.set(skill.id, versions)
    }
    versions.set(skill.version, { ...skill })
  }

  get(id: string, version?: string): Skill {
    const versions = this.byId.get(id)
    if (!versions) throw new SkillNotFoundError(id, version)
    if (version) {
      const s = versions.get(version)
      if (!s) throw new SkillNotFoundError(id, version)
      return s
    }
    const latest = [...versions.keys()].sort(compareVersions).pop()
    if (!latest) throw new SkillNotFoundError(id)
    return versions.get(latest)!
  }

  list(status?: SkillStatus): Skill[] {
    const out: Skill[] = []
    for (const versions of this.byId.values()) {
      for (const s of versions.values()) {
        if (!status || s.status === status) out.push(s)
      }
    }
    return out
  }

  metadata(): SkillMetadata[] {
    return this.list().map((s) => ({
      id: s.id,
      version: s.version,
      status: s.status,
      description: s.description,
      tags: s.tags,
      triggers: s.triggers,
      source: s.source,
      updatedAt: s.updatedAt,
    }))
  }

  transition(id: string, version: string, to: SkillStatus): Skill {
    const skill = this.get(id, version)
    if (!VALID_TRANSITIONS[skill.status].includes(to)) {
      throw new SkillTransitionError(skill.status, to)
    }
    skill.status = to
    return skill
  }

  async loadFromDir(dir: string): Promise<SkillLoadFromDirResult> {
    const loaded: Skill[] = []
    const errors: Array<{ file: string; error: string }> = []
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return { loaded, errors }
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue
      const fallbackName = entry.slice(0, -3)
      const path = join(dir, entry)
      try {
        const text = await Bun.file(path).text()
        const skill = parseSkillMarkdown(fallbackName, text, path)
        this.register(skill)
        loaded.push(skill)
      } catch (err) {
        errors.push({ file: path, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { loaded, errors }
  }
}
