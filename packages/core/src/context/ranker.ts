import type { ContextItem, ContextRequest, Ranker } from "./types.ts"

const WORD_RE = /[a-z0-9]+/g

export function tokenize(text: string): string[] {
  const out: string[] = []
  for (const match of text.toLowerCase().matchAll(WORD_RE)) {
    const tok = match[0]
    if (tok.length >= 3) out.push(tok)
  }
  return out
}

export class OverlapRanker implements Ranker {
  score(request: ContextRequest, item: ContextItem): number {
    const goalVocab = new Set([
      ...tokenize(request.goal),
      ...tokenize(request.expectedOutput ?? ""),
      ...(request.hints ?? []).flatMap((h) => tokenize(h)),
    ])
    if (goalVocab.size === 0) return 0
    const itemTokens = tokenize(item.content)
    if (itemTokens.length === 0) return 0
    const itemSet = new Set(itemTokens)
    let hits = 0
    for (const tok of goalVocab) if (itemSet.has(tok)) hits++
    const union = new Set([...goalVocab, ...itemSet]).size
    if (union === 0) return 0
    return hits / Math.min(goalVocab.size, itemSet.size)
  }
}

export interface TokenAwareRankerConfig {
  alpha?: number
}

export class TokenAwareRanker implements Ranker {
  constructor(
    private readonly base: Ranker,
    private readonly cfg: TokenAwareRankerConfig = {},
  ) {}

  score(request: ContextRequest, item: ContextItem): number {
    const baseScore = this.base.score(request, item)
    if (baseScore <= 0) return baseScore
    const tokens = Math.max(1, item.tokens ?? tokenize(item.content).length)
    const alpha = this.cfg.alpha ?? 0.35
    return baseScore * (1 / (1 + alpha * Math.log(tokens)))
  }
}
