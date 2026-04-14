import { CapsuleImportError, CapsuleNotFoundError } from "./errors.ts"
import type { Capsule, CapsuleFeedback, CapsuleType } from "./types.ts"

export interface CapsuleSearchQuery {
  text?: string
  domain?: string
  type?: CapsuleType
  tags?: string[]
  minScore?: number
  limit?: number
}

function matchesQuery(capsule: Capsule, q: CapsuleSearchQuery): boolean {
  if (q.type && capsule.type !== q.type) return false
  if (q.domain && capsule.domain !== q.domain) return false
  const tags = capsule.type === "individual" ? capsule.metadata.tags : []
  if (q.tags && !q.tags.every((t) => tags.includes(t))) return false
  if (q.minScore !== undefined) {
    const score = capsule.feedback.averageScore ?? 0
    if (score < q.minScore) return false
  }
  if (q.text) {
    const needle = q.text.toLowerCase()
    const haystack =
      capsule.type === "individual"
        ? `${capsule.triplet.instinct} ${capsule.triplet.experience} ${capsule.triplet.skill}`
        : capsule.lessons.join(" ")
    if (!haystack.toLowerCase().includes(needle)) return false
  }
  return true
}

export class CapsuleStore {
  private readonly capsules = new Map<string, Capsule>()

  register(capsule: Capsule): Capsule {
    this.capsules.set(capsule.id, capsule)
    return capsule
  }

  get(id: string): Capsule {
    const c = this.capsules.get(id)
    if (!c) throw new CapsuleNotFoundError(id)
    return c
  }

  delete(id: string): void {
    this.capsules.delete(id)
  }

  list(): Capsule[] {
    return [...this.capsules.values()]
  }

  search(query: CapsuleSearchQuery): Capsule[] {
    const out = this.list().filter((c) => matchesQuery(c, query))
    out.sort((a, b) => (b.feedback.averageScore ?? 0) - (a.feedback.averageScore ?? 0))
    return out.slice(0, query.limit ?? 20)
  }

  updateFeedback(id: string, update: (f: CapsuleFeedback) => CapsuleFeedback): Capsule {
    const capsule = this.get(id)
    capsule.feedback = update(capsule.feedback)
    capsule.updatedAt = Date.now()
    return capsule
  }

  exportJson(id: string): string {
    return JSON.stringify(this.get(id), null, 2)
  }

  importJson(text: string): Capsule {
    try {
      const parsed = JSON.parse(text) as Capsule
      if (!parsed?.id || !parsed.type) {
        throw new Error("missing id or type")
      }
      return this.register(parsed)
    } catch (err) {
      throw new CapsuleImportError(err)
    }
  }
}
