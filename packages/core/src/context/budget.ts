import type { ContextItem } from "./types.ts"

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export interface TrimResult {
  kept: ContextItem[]
  dropped: ContextItem[]
  tokensUsed: number
}

export function trimToBudget(items: ContextItem[], budgetTokens: number): TrimResult {
  const annotated = items.map((item, index) => ({
    item: { ...item, tokens: item.tokens ?? estimateTokens(item.content) },
    index,
  }))

  if (budgetTokens <= 0) {
    return { kept: [], dropped: items.map((i) => ({ ...i })), tokensUsed: 0 }
  }

  const sortedByDropPriority = [...annotated].sort((a, b) => {
    const sa = a.item.score ?? 0
    const sb = b.item.score ?? 0
    if (sa !== sb) return sa - sb
    return a.index - b.index
  })

  const droppedIds = new Set<string>()
  let total = annotated.reduce((n, x) => n + (x.item.tokens ?? 0), 0)

  for (const { item } of sortedByDropPriority) {
    if (total <= budgetTokens) break
    droppedIds.add(item.id)
    total -= item.tokens ?? 0
  }

  const kept = annotated.filter((a) => !droppedIds.has(a.item.id)).map((a) => a.item)
  const dropped = annotated.filter((a) => droppedIds.has(a.item.id)).map((a) => a.item)
  const tokensUsed = kept.reduce((n, i) => n + (i.tokens ?? 0), 0)
  return { kept, dropped, tokensUsed }
}
