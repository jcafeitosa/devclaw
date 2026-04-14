import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectStack } from "../../src/discovery/stack.ts"

describe("detectStack", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-stack-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("empty dir returns empty detections", async () => {
    const s = await detectStack(dir)
    expect(s.languages).toEqual([])
    expect(s.frameworks).toEqual([])
    expect(s.testRunners).toEqual([])
  })

  test("package.json with ts/astro/elysia detects all layers", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        dependencies: { astro: "^6", elysia: "^1.4", "@elysiajs/jwt": "^1" },
        devDependencies: { typescript: "^6" },
      }),
    )
    await writeFile(join(dir, "tsconfig.json"), "{}")
    await writeFile(join(dir, "bun.lock"), "")
    const s = await detectStack(dir)
    expect(s.languages.map((d) => d.id)).toContain("typescript")
    expect(s.languages.map((d) => d.id)).toContain("javascript")
    expect(s.runtimes.map((d) => d.id)).toContain("bun")
    expect(s.frameworks.map((d) => d.id).sort()).toContain("astro")
    expect(s.frameworks.map((d) => d.id).sort()).toContain("elysia")
  })

  test("detects test runners from deps", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^2" } }),
    )
    const s = await detectStack(dir)
    expect(s.testRunners.map((d) => d.id)).toContain("vitest")
  })

  test("python via pyproject.toml", async () => {
    await writeFile(join(dir, "pyproject.toml"), "[project]\nname='x'\n")
    const s = await detectStack(dir)
    expect(s.languages.map((d) => d.id)).toContain("python")
  })

  test("go via go.mod", async () => {
    await writeFile(join(dir, "go.mod"), "module demo\ngo 1.23\n")
    const s = await detectStack(dir)
    expect(s.languages.map((d) => d.id)).toContain("go")
  })

  test("rust via Cargo.toml", async () => {
    await writeFile(join(dir, "Cargo.toml"), "[package]\nname='x'\n")
    const s = await detectStack(dir)
    expect(s.languages.map((d) => d.id)).toContain("rust")
  })

  test("each detection carries evidence", async () => {
    await writeFile(join(dir, "package.json"), "{}")
    const s = await detectStack(dir)
    const js = s.languages.find((d) => d.id === "javascript")
    expect(js?.evidence).toContain("package.json")
  })
})
