import { MissingVariableError, RenderError } from "./errors.ts"
import type { RenderContext } from "./types.ts"

const IF_RE = /\{\{#if\s+([a-zA-Z_][\w.]*)\}\}([\s\S]*?)\{\{\/if\}\}/g
const EACH_RE = /\{\{#each\s+([a-zA-Z_][\w.]*)\}\}([\s\S]*?)\{\{\/each\}\}/g
const VAR_RE = /\{\{\s*(\.|[a-zA-Z_][\w.]*)(\?)?\s*\}\}/g

function lookup(ctx: RenderContext, key: string): unknown {
  const parts = key.split(".")
  let cur: unknown = ctx
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function truthy(v: unknown): boolean {
  if (v == null) return false
  if (v === false) return false
  if (v === "") return false
  if (Array.isArray(v) && v.length === 0) return false
  return true
}

function stringify(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}

function renderVars(tpl: string, ctx: RenderContext): string {
  return tpl.replace(VAR_RE, (_match, key: string, optional?: string) => {
    if (key === ".") {
      return stringify(ctx["."])
    }
    const v = lookup(ctx, key)
    if (v === undefined) {
      if (optional) return ""
      throw new MissingVariableError(key)
    }
    return stringify(v)
  })
}

function renderEach(tpl: string, ctx: RenderContext): string {
  return tpl.replace(EACH_RE, (_match, key: string, body: string) => {
    const list = lookup(ctx, key)
    if (!Array.isArray(list)) return ""
    let out = ""
    for (const entry of list) {
      const scoped: RenderContext =
        typeof entry === "object" && entry !== null
          ? { ...ctx, ...(entry as Record<string, unknown>), ".": entry }
          : { ...ctx, ".": entry }
      out += renderPass(body, scoped)
    }
    return out
  })
}

function renderIf(tpl: string, ctx: RenderContext): string {
  return tpl.replace(IF_RE, (_match, key: string, body: string) => {
    const v = lookup(ctx, key)
    return truthy(v) ? renderPass(body, ctx) : ""
  })
}

function renderPass(tpl: string, ctx: RenderContext): string {
  const afterIf = renderIf(tpl, ctx)
  const afterEach = renderEach(afterIf, ctx)
  return renderVars(afterEach, ctx)
}

export function render(template: string, ctx: RenderContext): string {
  try {
    return renderPass(template, ctx)
  } catch (err) {
    if (err instanceof MissingVariableError) throw err
    throw new RenderError(err instanceof Error ? err.message : String(err), err)
  }
}
