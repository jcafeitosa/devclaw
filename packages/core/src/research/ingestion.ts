import type { Chunk, Document } from "./types.ts"

export interface IngestConfig {
  maxChunkTokens?: number
  overlapTokens?: number
}

function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function splitByParagraph(content: string): string[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return paragraphs.length > 0 ? paragraphs : [content.trim()]
}

export function chunkText(content: string, cfg: IngestConfig = {}): string[] {
  const maxTokens = cfg.maxChunkTokens ?? 512
  const overlap = cfg.overlapTokens ?? 32
  const paragraphs = splitByParagraph(content)
  const chunks: string[] = []
  let buffer = ""
  let bufferTokens = 0
  for (const paragraph of paragraphs) {
    const tokens = estimateTokens(paragraph)
    if (tokens > maxTokens) {
      if (buffer.length > 0) {
        chunks.push(buffer)
        buffer = ""
        bufferTokens = 0
      }
      let start = 0
      const step = Math.max(1, maxTokens * 4 - overlap * 4)
      while (start < paragraph.length) {
        chunks.push(paragraph.slice(start, start + maxTokens * 4))
        start += step
      }
      continue
    }
    if (bufferTokens + tokens > maxTokens && buffer.length > 0) {
      chunks.push(buffer)
      buffer = paragraph
      bufferTokens = tokens
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph
      bufferTokens += tokens
    }
  }
  if (buffer.length > 0) chunks.push(buffer)
  return chunks
}

export function ingestDocument(document: Document, cfg: IngestConfig = {}): Chunk[] {
  return chunkText(document.content, cfg).map<Chunk>((content, position) => ({
    id: `${document.id}::${position}`,
    documentId: document.id,
    content,
    tokenEstimate: estimateTokens(content),
    position,
  }))
}
