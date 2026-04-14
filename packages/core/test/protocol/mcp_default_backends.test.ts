import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ContextAssembler } from "../../src/context/assembler.ts"
import { MultiSourceCollector } from "../../src/context/collector.ts"
import type { ContextItem, ContextSource } from "../../src/context/types.ts"
import {
  createContextBackends,
  createDecisionsBackend,
  createProjectOverviewBackend,
  createSkillBackends,
} from "../../src/protocol/mcp_default_backends.ts"
import { SkillActivator } from "../../src/skill/activator.ts"
import { SkillRegistry } from "../../src/skill/registry.ts"
import type { Skill } from "../../src/skill/types.ts"

function skill(id: string, triggers: string[]): Skill {
  return {
    id,
    version: "0.1.0",
    description: `${id} skill`,
    body: `${id} body`,
    status: "active",
    triggers,
    tags: [],
    inputs: [],
    steps: [],
    contextRequirements: [],
    tools: [],
    updatedAt: Date.now(),
  }
}

function assembler(
  collect: (req: {
    goal: string
    hints?: string[]
  }) => Promise<Omit<ContextItem, "sourceId" | "kind">[]>,
): ContextAssembler {
  const source: ContextSource = {
    id: "mem",
    async collect(req) {
      const raw = await collect({ goal: req.goal, hints: req.hints })
      return raw.map((i) => ({ ...i, sourceId: "mem", kind: "text" }))
    },
  }
  return new ContextAssembler({ collector: new MultiSourceCollector([source]) })
}

describe("createContextBackends", () => {
  test("searchContext returns items via assembler", async () => {
    const a = assembler(async () => [
      { id: "a", content: "the cat sat on the mat quietly", meta: { path: "a.md" } },
      { id: "b", content: "the dog barks loudly at nothing", meta: { path: "b.md" } },
    ])
    const { searchContext } = createContextBackends(a)
    const hits = (await searchContext("cat", 5)) as { snippet: string; path?: string }[]
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.snippet).toContain("cat")
  })

  test("getFileContext calls assembler scoped to the path", async () => {
    let captured: { goal: string; hints?: string[] } | undefined
    const a = assembler(async (req) => {
      captured = req
      return [{ id: "f", content: "file body", meta: { path: req.hints?.[0] ?? "" } }]
    })
    const { getFileContext } = createContextBackends(a)
    const res = (await getFileContext("pkg/x.ts")) as { path: string; snippet: string }
    expect(captured?.hints).toEqual(["pkg/x.ts"])
    expect(res.path).toBe("pkg/x.ts")
    expect(res.snippet).toContain("file body")
  })

  test("findRelated returns distinct-path items", async () => {
    const a = assembler(async () => [
      { id: "1", content: "x", meta: { path: "a.md" } },
      { id: "2", content: "y", meta: { path: "a.md" } },
      { id: "3", content: "z", meta: { path: "b.md" } },
    ])
    const { findRelated } = createContextBackends(a)
    const out = (await findRelated("seed.md", 10)) as { path: string }[]
    const paths = out.map((o) => o.path).sort()
    expect(paths).toEqual(["a.md", "b.md"])
  })
})

describe("createSkillBackends", () => {
  test("getSkillsFor returns matches from activator", async () => {
    const reg = new SkillRegistry()
    reg.register(skill("tdd", ["test", "tdd"]))
    reg.register(skill("refactor", ["refactor"]))
    const activator = new SkillActivator(reg)
    const { getSkillsFor } = createSkillBackends(activator)
    const out = (await getSkillsFor("apply tdd to the auth module")) as { id: string }[]
    expect(out.map((s) => s.id)).toContain("tdd")
  })
})

describe("createDecisionsBackend", () => {
  test("lists ADR files from a directory, filterable by substring", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-adr-"))
    try {
      await writeFile(join(dir, "001-use-bun.md"), "# ADR-001: use Bun\n\nBecause.")
      await writeFile(join(dir, "002-postgres.md"), "# ADR-002: pick Postgres\n\nWhy.")
      const { getDecisions } = createDecisionsBackend({ dir })
      const all = (await getDecisions()) as { id: string; title: string }[]
      expect(all).toHaveLength(2)
      const bun = (await getDecisions("bun")) as { id: string }[]
      expect(bun).toHaveLength(1)
      expect(bun[0]!.id).toBe("001-use-bun")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("returns empty when dir does not exist", async () => {
    const { getDecisions } = createDecisionsBackend({ dir: "/nope/nonexistent" })
    expect(await getDecisions()).toEqual([])
  })
})

describe("createProjectOverviewBackend", () => {
  test("reads name/version from package.json and packages dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-ovw-"))
    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "demo", version: "1.2.3", description: "hi" }),
      )
      await mkdir(join(dir, "packages", "core"), { recursive: true })
      await mkdir(join(dir, "packages", "cli"), { recursive: true })
      const { getProjectOverview } = createProjectOverviewBackend({ root: dir })
      const out = (await getProjectOverview()) as {
        name: string
        version: string
        description?: string
        packages: string[]
      }
      expect(out.name).toBe("demo")
      expect(out.version).toBe("1.2.3")
      expect(out.packages.sort()).toEqual(["cli", "core"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("falls back gracefully when package.json missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-ovw2-"))
    try {
      const { getProjectOverview } = createProjectOverviewBackend({ root: dir })
      const out = (await getProjectOverview()) as { name: string; packages: string[] }
      expect(out.name).toBe("<unknown>")
      expect(out.packages).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
