import type { ContextObject } from "../context/types.ts"
import type { SubagentRestrictions } from "./types.ts"

export interface ContextFilterInput {
  parent: ContextObject
  restrictions?: SubagentRestrictions
  allowKinds?: string[]
  allowTags?: string[]
}

export function filterContextForSubagent(input: ContextFilterInput): ContextObject {
  const parent = input.parent
  const allowKinds = input.allowKinds
  const allowTags = input.allowTags
  const allowTools = input.restrictions?.toolAllowlist
  const denyTools = input.restrictions?.toolDenylist

  const items = parent.items.filter((item) => {
    if (allowKinds && !allowKinds.includes(item.kind)) return false
    const itemTags = (item.meta?.tags ?? "").split(",").filter(Boolean)
    if (allowTags && !allowTags.some((t) => itemTags.includes(t))) return false
    const tool = item.meta?.tool
    if (tool && denyTools?.includes(tool)) return false
    if (tool && allowTools && allowTools.length > 0 && !allowTools.includes(tool)) return false
    return true
  })

  const relevantData = parent.relevantData.filter((item) => items.some((i) => i.id === item.id))
  const tokens = items.reduce((n, i) => n + (i.tokens ?? 0), 0)

  return {
    ...parent,
    items,
    relevantData,
    totals: { items: items.length, tokens },
  }
}
