import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SkillNotFoundError, SkillTransitionError } from "../../src/skill/errors.ts"
import { parseSkillMarkdown } from "../../src/skill/parser.ts"
import { SkillRegistry } from "../../src/skill/registry.ts"

describe("SkillRegistry", () => {
  test("register + get latest", () => {
    const r = new SkillRegistry()
    r.register(parseSkillMarkdown("x", "---\nname: x\nversion: 1.0.0\n---\n"))
    r.register(parseSkillMarkdown("x", "---\nname: x\nversion: 2.0.0\n---\n"))
    expect(r.get("x").version).toBe("2.0.0")
  })

  test("get specific version", () => {
    const r = new SkillRegistry()
    r.register(parseSkillMarkdown("x", "---\nname: x\nversion: 1.0.0\n---\n"))
    r.register(parseSkillMarkdown("x", "---\nname: x\nversion: 2.0.0\n---\n"))
    expect(r.get("x", "1.0.0").version).toBe("1.0.0")
  })

  test("get unknown throws", () => {
    const r = new SkillRegistry()
    expect(() => r.get("missing")).toThrow(SkillNotFoundError)
  })

  test("list filters by status", () => {
    const r = new SkillRegistry()
    r.register(parseSkillMarkdown("a", "---\nname: a\nstatus: active\n---\n"))
    r.register(parseSkillMarkdown("b", "---\nname: b\nstatus: draft\n---\n"))
    expect(r.list("active").map((s) => s.id)).toEqual(["a"])
  })

  test("transition validated", () => {
    const r = new SkillRegistry()
    r.register(parseSkillMarkdown("x", "---\nname: x\nversion: 1.0.0\nstatus: draft\n---\n"))
    r.transition("x", "1.0.0", "review")
    expect(r.get("x").status).toBe("review")
    r.transition("x", "1.0.0", "active")
    expect(r.get("x").status).toBe("active")
    expect(() => r.transition("x", "1.0.0", "draft")).toThrow(SkillTransitionError)
  })

  test("archived is terminal", () => {
    const r = new SkillRegistry()
    r.register(parseSkillMarkdown("x", "---\nname: x\nstatus: archived\n---\n"))
    expect(() => r.transition("x", "1.0.0", "active")).toThrow(SkillTransitionError)
  })

  test("metadata returns light-weight view", () => {
    const r = new SkillRegistry()
    r.register(parseSkillMarkdown("x", "---\nname: x\ntags: [a,b]\n---\nbig body"))
    const m = r.metadata()
    expect(m[0]?.id).toBe("x")
    expect((m[0] as unknown as { body?: string }).body).toBeUndefined()
  })
})

describe("SkillRegistry.loadFromDir", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-skill-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("loads all .md files + skips others", async () => {
    await writeFile(join(dir, "a.md"), "---\nname: a\n---\nbody")
    await writeFile(join(dir, "b.md"), "---\nname: b\n---\nbody")
    await writeFile(join(dir, "note.txt"), "skip me")
    const r = new SkillRegistry()
    const { loaded } = await r.loadFromDir(dir)
    expect(loaded.map((s) => s.id).sort()).toEqual(["a", "b"])
  })

  test("missing dir returns empty without throwing", async () => {
    const r = new SkillRegistry()
    const result = await r.loadFromDir(join(dir, "nope"))
    expect(result.loaded).toEqual([])
  })
})
