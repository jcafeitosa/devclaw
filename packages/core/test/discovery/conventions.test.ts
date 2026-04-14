import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectConventions } from "../../src/discovery/conventions.ts"

describe("detectConventions", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-conv-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("empty dir returns no conventions", async () => {
    const r = await detectConventions(dir)
    expect(r.linter).toBeUndefined()
    expect(r.formatter).toBeUndefined()
    expect(r.testLocation).toBeUndefined()
  })

  test("biome.json → biome as linter+formatter", async () => {
    await writeFile(join(dir, "biome.json"), "{}")
    const r = await detectConventions(dir)
    expect(r.linter).toBe("biome")
    expect(r.formatter).toBe("biome")
  })

  test(".eslintrc.* + .prettierrc* → eslint + prettier", async () => {
    await writeFile(join(dir, ".eslintrc.json"), "{}")
    await writeFile(join(dir, ".prettierrc"), "{}")
    const r = await detectConventions(dir)
    expect(r.linter).toBe("eslint")
    expect(r.formatter).toBe("prettier")
  })

  test("commitlint.config.* → conventional commits", async () => {
    await writeFile(join(dir, "commitlint.config.js"), "module.exports = {}")
    const r = await detectConventions(dir)
    expect(r.commitConvention).toBe("conventional-commits")
  })

  test("test/ or tests/ dir → separate-dir layout", async () => {
    await mkdir(join(dir, "test"))
    const r = await detectConventions(dir)
    expect(r.testLocation).toBe("separate-dir")
  })

  test("src/foo.test.ts → alongside-source layout", async () => {
    await mkdir(join(dir, "src"))
    await writeFile(join(dir, "src/foo.test.ts"), "")
    const r = await detectConventions(dir)
    expect(r.testLocation).toBe("alongside-source")
  })
})
