import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { CommandNotFoundError } from "./errors.ts"
import { parseFrontmatterMarkdown } from "./frontmatter.ts"
import type { ArgSpec, SlashDefinition } from "./types.ts"

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter((x): x is string => typeof x === "string")
}

function asArgSpecs(v: unknown): ArgSpec[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: ArgSpec[] = []
  for (const entry of v) {
    if (!entry || typeof entry !== "object") continue
    const rec = entry as Record<string, unknown>
    const name = typeof rec.name === "string" ? rec.name : undefined
    const type =
      rec.type === "string" || rec.type === "number" || rec.type === "boolean"
        ? rec.type
        : undefined
    if (!name || !type) continue
    const spec: ArgSpec = { name, type }
    if (rec.required === true) spec.required = true
    if (
      typeof rec.default === "string" ||
      typeof rec.default === "number" ||
      typeof rec.default === "boolean"
    ) {
      spec.default = rec.default
    }
    if (typeof rec.describe === "string") spec.describe = rec.describe
    out.push(spec)
  }
  return out.length > 0 ? out : undefined
}

export function definitionFromMarkdown(
  name: string,
  text: string,
  source?: string,
): SlashDefinition {
  const { frontmatter, body } = parseFrontmatterMarkdown(text)
  const fmName = typeof frontmatter.name === "string" ? frontmatter.name : name
  const def: SlashDefinition = {
    name: fmName,
    body,
    source,
  }
  if (typeof frontmatter.description === "string") def.description = frontmatter.description
  const agents = asStringArray(frontmatter.agents) as SlashDefinition["agents"]
  if (agents) def.agents = agents
  const tools = asStringArray(frontmatter.tools)
  if (tools) def.tools = tools
  const disallowed = asStringArray(frontmatter.disallowedTools)
  if (disallowed) def.disallowedTools = disallowed
  if (typeof frontmatter.model === "string") def.model = frontmatter.model
  if (typeof frontmatter.maxTurns === "number") def.maxTurns = frontmatter.maxTurns
  if (
    typeof frontmatter.isolation === "string" &&
    ["none", "worktree", "sandbox", "container", "fork"].includes(frontmatter.isolation)
  ) {
    def.isolation = frontmatter.isolation as SlashDefinition["isolation"]
  }
  if (typeof frontmatter.budget_usd === "number") def.budgetUsd = frontmatter.budget_usd
  if (typeof frontmatter.timeout_minutes === "number") {
    def.timeoutMinutes = frontmatter.timeout_minutes
  }
  const argSpecs = asArgSpecs(frontmatter.args)
  if (argSpecs) def.args = argSpecs
  if (typeof frontmatter.version === "string") def.version = frontmatter.version
  if (frontmatter.hooks && typeof frontmatter.hooks === "object") {
    const h = frontmatter.hooks as Record<string, unknown>
    def.hooks = {}
    if (typeof h.pre === "string") def.hooks.pre = h.pre
    if (typeof h.post === "string") def.hooks.post = h.post
  }
  return def
}

export interface LoadFromDirResult {
  loaded: SlashDefinition[]
  errors: Array<{ file: string; error: string }>
}

export class SlashRegistry {
  private readonly defs = new Map<string, SlashDefinition>()

  register(def: SlashDefinition): void {
    this.defs.set(def.name, def)
  }

  has(name: string): boolean {
    return this.defs.has(name)
  }

  get(name: string): SlashDefinition {
    const def = this.defs.get(name)
    if (!def) throw new CommandNotFoundError(name)
    return def
  }

  list(): SlashDefinition[] {
    return [...this.defs.values()]
  }

  async loadFromDir(dir: string): Promise<LoadFromDirResult> {
    const loaded: SlashDefinition[] = []
    const errors: Array<{ file: string; error: string }> = []
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return { loaded, errors }
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue
      const name = entry.slice(0, -3)
      const path = join(dir, entry)
      try {
        const text = await Bun.file(path).text()
        const def = definitionFromMarkdown(name, text, path)
        this.register(def)
        loaded.push(def)
      } catch (err) {
        errors.push({ file: path, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return { loaded, errors }
  }
}
