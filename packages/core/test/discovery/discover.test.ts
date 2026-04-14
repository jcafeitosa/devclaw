import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { discover } from "../../src/discovery/discover.ts"

describe("discover (orchestrator)", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-discover-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("returns report with scannedAt + projectRoot + 3 sub-reports", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { astro: "^6" } }))
    await writeFile(join(dir, "biome.json"), "{}")
    const report = await discover(dir, {
      cli: { which: async () => null, version: async () => "" },
    })
    expect(report.projectRoot).toBe(dir)
    expect(typeof report.scannedAt).toBe("string")
    expect(report.stack.frameworks.map((d) => d.id)).toContain("astro")
    expect(report.conventions.linter).toBe("biome")
    expect(Object.keys(report.clis).sort()).toEqual(["aider", "claude", "codex", "gemini"])
  })

  test("runs detectors concurrently without mutual interference", async () => {
    const r = await discover(dir, {
      cli: { which: async () => null, version: async () => "" },
    })
    expect(r.stack.languages).toEqual([])
    expect(r.conventions.linter).toBeUndefined()
    expect(r.clis.claude?.available).toBe(false)
  })
})
