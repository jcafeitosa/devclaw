import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import type { ContextAssembler } from "../context/assembler.ts"
import type { ContextItem } from "../context/types.ts"
import type { SkillActivator } from "../skill/activator.ts"
import type { BuiltinToolBackends } from "./mcp_builtin.ts"

function snippet(content: string, max = 240): string {
  if (content.length <= max) return content
  return `${content.slice(0, max)}…`
}

function pathOf(item: ContextItem): string | undefined {
  return item.meta?.path
}

async function safeAssemble(
  assembler: ContextAssembler,
  goal: string,
  hints?: string[],
): Promise<ContextItem[]> {
  try {
    const obj = await assembler.assemble({
      goal,
      expectedOutput: "relevant snippets",
      hints,
    })
    return obj.items
  } catch {
    return []
  }
}

export function createContextBackends(
  assembler: ContextAssembler,
): Required<Pick<BuiltinToolBackends, "searchContext" | "getFileContext" | "findRelated">> {
  return {
    async searchContext(query, limit) {
      const items = await safeAssemble(assembler, query)
      return items.slice(0, limit ?? 5).map((i) => ({
        snippet: snippet(i.content),
        path: pathOf(i),
        score: i.score,
      }))
    },
    async getFileContext(path) {
      const items = await safeAssemble(assembler, `context for file ${path}`, [path])
      const first = items[0]
      return {
        path,
        snippet: first ? snippet(first.content) : "",
        items: items.length,
      }
    },
    async findRelated(path, limit) {
      const items = await safeAssemble(assembler, `files related to ${path}`, [path])
      const seen = new Set<string>()
      const out: { path: string; score?: number }[] = []
      for (const item of items) {
        const p = pathOf(item)
        if (!p || p === path || seen.has(p)) continue
        seen.add(p)
        out.push({ path: p, score: item.score })
        if (out.length >= (limit ?? 5)) break
      }
      return out
    },
  }
}

export function createSkillBackends(
  activator: SkillActivator,
): Required<Pick<BuiltinToolBackends, "getSkillsFor">> {
  return {
    async getSkillsFor(task) {
      const matches = activator.activate({ goal: task })
      return matches.map((m) => ({
        id: m.skill.id,
        description: m.skill.description,
        reason: m.reasons.join(", "),
        score: m.score,
      }))
    },
  }
}

export interface DecisionsBackendConfig {
  dir: string
}

export function createDecisionsBackend(
  cfg: DecisionsBackendConfig,
): Required<Pick<BuiltinToolBackends, "getDecisions">> {
  return {
    async getDecisions(filter) {
      try {
        const entries = await readdir(cfg.dir)
        const md = entries.filter((e) => e.endsWith(".md"))
        const out: { id: string; title: string; path: string }[] = []
        for (const entry of md) {
          const full = join(cfg.dir, entry)
          const body = await readFile(full, "utf8").catch(() => "")
          const titleMatch = body.match(/^#\s+(.+?)\s*$/m)
          const title = titleMatch?.[1] ?? entry
          const id = entry.replace(/\.md$/, "")
          const hay = `${id} ${title}`.toLowerCase()
          if (filter && !hay.includes(filter.toLowerCase())) continue
          out.push({ id, title, path: full })
        }
        return out
      } catch {
        return []
      }
    },
  }
}

export interface ProjectOverviewBackendConfig {
  root: string
}

export function createProjectOverviewBackend(
  cfg: ProjectOverviewBackendConfig,
): Required<Pick<BuiltinToolBackends, "getProjectOverview">> {
  return {
    async getProjectOverview() {
      let name = "<unknown>"
      let version = "0.0.0"
      let description: string | undefined
      try {
        const pkg = JSON.parse(await readFile(join(cfg.root, "package.json"), "utf8")) as {
          name?: string
          version?: string
          description?: string
        }
        if (pkg.name) name = pkg.name
        if (pkg.version) version = pkg.version
        description = pkg.description
      } catch {
        // keep defaults
      }
      let packages: string[] = []
      try {
        const entries = await readdir(join(cfg.root, "packages"))
        packages = []
        for (const entry of entries) {
          const full = join(cfg.root, "packages", entry)
          const s = await stat(full).catch(() => null)
          if (s?.isDirectory()) packages.push(entry)
        }
      } catch {
        packages = []
      }
      return { name, version, description, packages }
    },
  }
}
