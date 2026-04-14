import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CommandNotFoundError } from "../../src/slash/errors.ts"
import { definitionFromMarkdown, SlashRegistry } from "../../src/slash/registry.ts"

describe("definitionFromMarkdown", () => {
  test("pulls frontmatter fields into SlashDefinition shape", () => {
    const def = definitionFromMarkdown(
      "architect",
      `---
description: Design system
agents: [architect, backend]
tools: [Read, Write]
isolation: worktree
budget_usd: 5
timeout_minutes: 30
args:
  - name: scope
    type: string
    required: true
---
body text`,
    )
    expect(def.name).toBe("architect")
    expect(def.description).toBe("Design system")
    expect(def.agents).toEqual(["architect", "backend"])
    expect(def.tools).toEqual(["Read", "Write"])
    expect(def.isolation).toBe("worktree")
    expect(def.budgetUsd).toBe(5)
    expect(def.timeoutMinutes).toBe(30)
    expect(def.args?.[0]).toMatchObject({ name: "scope", type: "string", required: true })
    expect(def.body).toBe("body text")
  })

  test("ignores invalid isolation values", () => {
    const def = definitionFromMarkdown(
      "x",
      `---
isolation: mars
---
`,
    )
    expect(def.isolation).toBeUndefined()
  })
})

describe("SlashRegistry", () => {
  test("register + has + get + list", () => {
    const r = new SlashRegistry()
    const def = definitionFromMarkdown("architect", "---\n---\n")
    r.register(def)
    expect(r.has("architect")).toBe(true)
    expect(r.get("architect").name).toBe("architect")
    expect(r.list()).toHaveLength(1)
  })

  test("get unknown throws CommandNotFoundError", () => {
    const r = new SlashRegistry()
    expect(() => r.get("missing")).toThrow(CommandNotFoundError)
  })

  test("register last-wins (override)", () => {
    const r = new SlashRegistry()
    r.register({ name: "x", body: "first" })
    r.register({ name: "x", body: "second" })
    expect(r.get("x").body).toBe("second")
  })
})

describe("SlashRegistry.loadFromDir", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-slash-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("loads all .md files in dir", async () => {
    await writeFile(join(dir, "a.md"), "---\ndescription: A\n---\nbody A")
    await writeFile(join(dir, "b.md"), "---\ndescription: B\n---\nbody B")
    await writeFile(join(dir, "ignore.txt"), "not md")
    const r = new SlashRegistry()
    const { loaded, errors } = await r.loadFromDir(dir)
    expect(loaded.map((d) => d.name).sort()).toEqual(["a", "b"])
    expect(errors).toEqual([])
  })

  test("missing dir returns empty without throwing", async () => {
    const r = new SlashRegistry()
    const { loaded } = await r.loadFromDir(join(dir, "nonexistent"))
    expect(loaded).toEqual([])
  })

  test("merge order: later loadFromDir overrides earlier definitions", async () => {
    const d1 = await mkdir(join(dir, "d1"), { recursive: true }).then(() => join(dir, "d1"))
    const d2 = await mkdir(join(dir, "d2"), { recursive: true }).then(() => join(dir, "d2"))
    await writeFile(join(d1, "architect.md"), "---\ndescription: user-level\n---\n")
    await writeFile(join(d2, "architect.md"), "---\ndescription: project-level\n---\n")
    const r = new SlashRegistry()
    await r.loadFromDir(d1)
    await r.loadFromDir(d2)
    expect(r.get("architect").description).toBe("project-level")
  })

  test("parse error reported in errors array, does not throw", async () => {
    await writeFile(join(dir, "bad.md"), "---\nname: bad\n")
    const r = new SlashRegistry()
    const { loaded, errors } = await r.loadFromDir(dir)
    expect(loaded).toEqual([])
    expect(errors.length).toBe(1)
    expect(errors[0]?.file).toContain("bad.md")
  })
})
