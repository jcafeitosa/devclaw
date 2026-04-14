export interface Embedder {
  embed(text: string): Promise<number[]>
  dim(): number
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dimension mismatch ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface HashEmbedderConfig {
  dim?: number
  minTokenLength?: number
}

const WORD_RE = /[a-z0-9]+/g

function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export class HashEmbedder implements Embedder {
  private readonly dimension: number
  private readonly minTokenLength: number

  constructor(cfg: HashEmbedderConfig = {}) {
    this.dimension = cfg.dim ?? 384
    this.minTokenLength = cfg.minTokenLength ?? 2
  }

  dim(): number {
    return this.dimension
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Array(this.dimension).fill(0) as number[]
    const tokens = text.toLowerCase().match(WORD_RE) ?? []
    let tokenCount = 0
    for (const tok of tokens) {
      if (tok.length < this.minTokenLength) continue
      tokenCount++
      const h1 = fnv1a(tok)
      const h2 = fnv1a(`${tok}.`)
      const idx1 = h1 % this.dimension
      const idx2 = h2 % this.dimension
      const sign1 = (h1 & 1) === 0 ? 1 : -1
      const sign2 = (h2 & 1) === 0 ? 1 : -1
      vec[idx1] = (vec[idx1] ?? 0) + sign1
      vec[idx2] = (vec[idx2] ?? 0) + sign2
    }
    if (tokenCount === 0) return vec
    // L2 normalize preserves cosine semantics
    let norm = 0
    for (const x of vec) norm += x * x
    const n = Math.sqrt(norm)
    if (n === 0) return vec
    for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / n
    return vec
  }
}
