import { TemplateNotFoundError } from "./errors.ts"
import type { Template } from "./types.ts"

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

export class TemplateRegistry {
  private entries = new Map<string, Map<string, Template>>()

  register(template: Template): void {
    let byVersion = this.entries.get(template.id)
    if (!byVersion) {
      byVersion = new Map()
      this.entries.set(template.id, byVersion)
    }
    if (byVersion.has(template.version)) {
      throw new Error(`template ${template.id}@${template.version} already registered`)
    }
    byVersion.set(template.version, template)
  }

  get(id: string, version?: string): Template {
    const byVersion = this.entries.get(id)
    if (!byVersion) throw new TemplateNotFoundError(id, version)
    if (version) {
      const tpl = byVersion.get(version)
      if (!tpl) throw new TemplateNotFoundError(id, version)
      return tpl
    }
    const versions = [...byVersion.keys()].sort(compareVersions)
    const latest = versions[versions.length - 1]
    if (!latest) throw new TemplateNotFoundError(id)
    const tpl = byVersion.get(latest)
    if (!tpl) throw new TemplateNotFoundError(id)
    return tpl
  }

  versions(id: string): string[] {
    const byVersion = this.entries.get(id)
    if (!byVersion) return []
    return [...byVersion.keys()].sort(compareVersions)
  }

  list(): Template[] {
    const out: Template[] = []
    for (const byVersion of this.entries.values()) {
      out.push(...byVersion.values())
    }
    return out
  }
}
