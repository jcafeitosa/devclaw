import { CommandParseError } from "./errors.ts"

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>
  body: string
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === "") return ""
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (trimmed === "null" || trimmed === "~") return null
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim()
    if (inner === "") return []
    return inner.split(",").map((p) => parseScalar(p.trim()))
  }
  return trimmed
}

function parseFrontmatterBlock(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lines = text.split("\n")
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]!
    i++
    const line = raw.trimEnd()
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue
    const indentMatch = line.match(/^(\s*)(.*)$/)
    if (!indentMatch) continue
    const content = indentMatch[2] ?? ""
    if (indentMatch[1] && indentMatch[1].length > 0) {
      // nested lines handled by their owner
      continue
    }
    const colon = content.indexOf(":")
    if (colon === -1) continue
    const key = content.slice(0, colon).trim()
    const rest = content.slice(colon + 1).trim()

    if (rest === "") {
      const childLines: string[] = []
      while (i < lines.length) {
        const next = lines[i]!
        if (next.trim() === "") {
          i++
          continue
        }
        if (/^\s+-\s/.test(next) || /^\s+\S/.test(next)) {
          childLines.push(next)
          i++
        } else {
          break
        }
      }
      if (childLines.some((l) => /^\s+-\s/.test(l))) {
        const items: unknown[] = []
        for (let j = 0; j < childLines.length; j++) {
          const cl = childLines[j]!
          const match = cl.match(/^(\s+)-\s+(.*)$/)
          if (!match) continue
          const itemFirstLine = match[2] ?? ""
          if (itemFirstLine.includes(":")) {
            const obj: Record<string, unknown> = {}
            const idx = itemFirstLine.indexOf(":")
            const k = itemFirstLine.slice(0, idx).trim()
            const v = itemFirstLine.slice(idx + 1).trim()
            obj[k] = parseScalar(v)
            let k2 = j + 1
            while (k2 < childLines.length && !/^\s+-\s/.test(childLines[k2]!)) {
              const kv = childLines[k2]!.trimStart()
              if (kv.includes(":")) {
                const ci = kv.indexOf(":")
                obj[kv.slice(0, ci).trim()] = parseScalar(kv.slice(ci + 1).trim())
              }
              k2++
            }
            items.push(obj)
            j = k2 - 1
          } else {
            items.push(parseScalar(itemFirstLine))
          }
        }
        out[key] = items
      } else {
        const nested: Record<string, unknown> = {}
        for (const cl of childLines) {
          const kv = cl.trimStart()
          const idx = kv.indexOf(":")
          if (idx === -1) continue
          nested[kv.slice(0, idx).trim()] = parseScalar(kv.slice(idx + 1).trim())
        }
        out[key] = nested
      }
    } else {
      out[key] = parseScalar(rest)
    }
  }
  return out
}

export function parseFrontmatterMarkdown(text: string): ParsedFrontmatter {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: {}, body: text }
  }
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  let closeIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      closeIndex = i
      break
    }
  }
  if (closeIndex === -1) {
    throw new CommandParseError(text, "unterminated frontmatter block")
  }
  const fmText = lines.slice(1, closeIndex).join("\n")
  const body = lines.slice(closeIndex + 1).join("\n")
  return { frontmatter: parseFrontmatterBlock(fmText), body }
}
