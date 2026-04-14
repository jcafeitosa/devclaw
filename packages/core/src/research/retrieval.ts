import { AUTHORITY_RANK, type Document, type Query } from "./types.ts"

const WORD_RE = /[a-z0-9]+/g

function tokenize(text: string): Set<string> {
  const out = new Set<string>()
  for (const match of text.toLowerCase().matchAll(WORD_RE)) {
    if (match[0].length >= 3) out.add(match[0])
  }
  return out
}

function relevance(doc: Document, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0
  const docTokens = tokenize(`${doc.title} ${doc.content}`)
  if (docTokens.size === 0) return 0
  let hits = 0
  for (const t of queryTokens) if (docTokens.has(t)) hits++
  return hits / queryTokens.size
}

function freshness(doc: Document, now: number): number {
  const anchor = doc.publishedAt ?? doc.fetchedAt
  const ageDays = Math.max(0, (now - anchor) / (24 * 60 * 60 * 1000))
  return 1 / (1 + ageDays / 30)
}

function authority(doc: Document): number {
  return AUTHORITY_RANK[doc.tier] / 7
}

export interface RankedDocument extends Document {
  score: number
  relevance: number
  authority: number
  freshness: number
}

export interface RankOptions {
  now?: number
  weights?: { relevance?: number; authority?: number; freshness?: number }
  minScore?: number
  limit?: number
}

export function rankDocuments(
  query: Query,
  documents: Document[],
  opts: RankOptions = {},
): RankedDocument[] {
  const now = opts.now ?? Date.now()
  const wRelevance = opts.weights?.relevance ?? 0.6
  const wAuthority = opts.weights?.authority ?? 0.25
  const wFreshness = opts.weights?.freshness ?? 0.15
  const queryTokens = tokenize(query.text)
  const minScore = opts.minScore ?? query.minScore ?? 0
  const ranked: RankedDocument[] = []
  for (const doc of documents) {
    if (query.tiers && !query.tiers.includes(doc.tier)) continue
    const rel = relevance(doc, queryTokens)
    const auth = authority(doc)
    const fresh = freshness(doc, now)
    const score = wRelevance * rel + wAuthority * auth + wFreshness * fresh
    if (score < minScore) continue
    ranked.push({ ...doc, score, relevance: rel, authority: auth, freshness: fresh })
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return ranked.slice(0, query.limit ?? opts.limit ?? 10)
}
