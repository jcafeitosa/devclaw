import { CommandParseError, CommandValidationError } from "./errors.ts"
import type { ArgSpec, CommandInvocation, SlashDefinition } from "./types.ts"

function coerce(type: ArgSpec["type"], raw: string | number | boolean): string | number | boolean {
  if (type === "boolean") {
    if (raw === true || raw === "true") return true
    if (raw === false || raw === "false") return false
    throw new Error(`expected boolean, got '${String(raw)}'`)
  }
  if (type === "number") {
    const n = Number(raw)
    if (Number.isNaN(n)) throw new Error(`expected number, got '${String(raw)}'`)
    return n
  }
  return String(raw)
}

function tokenize(line: string): string[] {
  const trimmed = line.trim()
  const tokens: string[] = []
  let i = 0
  while (i < trimmed.length) {
    const ch = trimmed[i]!
    if (ch === " " || ch === "\t") {
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let buf = ""
      while (j < trimmed.length && trimmed[j] !== quote) {
        if (trimmed[j] === "\\" && j + 1 < trimmed.length) {
          buf += trimmed[j + 1]
          j += 2
          continue
        }
        buf += trimmed[j]
        j++
      }
      if (j >= trimmed.length) throw new CommandParseError(line, "unterminated quoted string")
      tokens.push(buf)
      i = j + 1
      continue
    }
    let j = i
    while (j < trimmed.length && trimmed[j] !== " " && trimmed[j] !== "\t") j++
    tokens.push(trimmed.slice(i, j))
    i = j
  }
  return tokens
}

export function parseInvocation(line: string): CommandInvocation {
  const raw = line.trim()
  if (!raw.startsWith("/")) throw new CommandParseError(raw, "expected leading '/'")
  const tokens = tokenize(raw)
  const head = tokens[0]!.slice(1)
  if (!head) throw new CommandParseError(raw, "missing command name")
  const positional: string[] = []
  const flags: Record<string, string | number | boolean> = {}
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!
    if (tok.startsWith("--no-")) {
      flags[tok.slice(5)] = false
      continue
    }
    if (tok.startsWith("--")) {
      const body = tok.slice(2)
      const eq = body.indexOf("=")
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1)
      } else {
        const next = tokens[i + 1]
        if (next !== undefined && !next.startsWith("-")) {
          flags[body] = next
          i++
        } else {
          flags[body] = true
        }
      }
      continue
    }
    positional.push(tok)
  }
  return { name: head, positional, flags }
}

export function validateInvocation(
  def: SlashDefinition,
  invocation: CommandInvocation,
): Record<string, string | number | boolean> {
  const issues: string[] = []
  const out: Record<string, string | number | boolean> = {}
  const specs = def.args ?? []
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!
    const flagValue = invocation.flags[spec.name]
    const posValue = invocation.positional[i]
    const raw = flagValue !== undefined ? flagValue : posValue
    if (raw === undefined) {
      if (spec.required) {
        issues.push(`missing required arg '${spec.name}'`)
        continue
      }
      if (spec.default !== undefined) out[spec.name] = spec.default
      continue
    }
    try {
      out[spec.name] = coerce(spec.type, raw)
    } catch (err) {
      issues.push(`arg '${spec.name}': ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (issues.length > 0) throw new CommandValidationError(def.name, issues)
  return out
}
