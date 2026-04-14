import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DiscoverySource } from "../../src/context/sources/discovery.ts"
import { TextFragmentsSource } from "../../src/context/sources/text.ts"

describe("TextFragmentsSource", () => {
  test("emits fragments as ContextItems", async () => {
    const src = new TextFragmentsSource({
      fragments: [
        { id: "a", content: "hello" },
        { id: "b", content: "world", kind: "doc" },
      ],
    })
    const items = await src.collect()
    expect(items).toHaveLength(2)
    expect(items[0]?.sourceId).toBe("text-fragments")
    expect(items[1]?.kind).toBe("doc")
  })

  test("add() appends a fragment", async () => {
    const src = new TextFragmentsSource({ fragments: [] })
    src.add({ id: "a", content: "x" })
    expect((await src.collect()).length).toBe(1)
  })
})

describe("DiscoverySource", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-discsrc-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("reports detected stack + conventions as context items", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { astro: "^6" }, devDependencies: { vitest: "^2" } }),
    )
    await writeFile(join(dir, "biome.json"), "{}")
    const src = new DiscoverySource({
      rootDir: dir,
      opts: { cli: { which: async () => null, version: async () => "" } },
    })
    const items = await src.collect()
    const ids = items.map((i) => i.id)
    expect(ids).toContain("stack.frameworks")
    expect(ids).toContain("stack.testRunners")
    expect(ids).toContain("conventions")
  })

  test("caches unless refresh=true", async () => {
    await writeFile(join(dir, "package.json"), "{}")
    const src = new DiscoverySource({
      rootDir: dir,
      opts: { cli: { which: async () => null, version: async () => "" } },
    })
    const a = await src.collect()
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { astro: "^6" } }))
    const b = await src.collect()
    expect(b.length).toBe(a.length)
  })
})
