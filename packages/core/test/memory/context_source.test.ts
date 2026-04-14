import { describe, expect, test } from "bun:test"
import { ContextAssembler } from "../../src/context/assembler.ts"
import { MultiSourceCollector } from "../../src/context/collector.ts"
import { MemoryContextSource } from "../../src/memory/context_source.ts"
import { HashEmbedder } from "../../src/memory/embedding.ts"
import { InMemoryEpisodic } from "../../src/memory/episodic.ts"
import { InMemoryLongTerm } from "../../src/memory/long_term.ts"
import { MemoryService } from "../../src/memory/service.ts"
import { InMemoryShortTerm } from "../../src/memory/short_term.ts"

function svc() {
  const embedder = new HashEmbedder({ dim: 256 })
  return new MemoryService({
    shortTerm: new InMemoryShortTerm({ defaultTtlMs: 60_000 }),
    longTerm: new InMemoryLongTerm({ embedder }),
    episodic: new InMemoryEpisodic(),
    embedder,
  })
}

describe("MemoryContextSource", () => {
  test("surfaces long-term matches as ContextItems", async () => {
    const s = svc()
    await s.write({ tier: "long", content: "postgres migration safety checklist" })
    const src = new MemoryContextSource({ service: s })
    const items = await src.collect({
      goal: "postgres migration",
      expectedOutput: "plan",
    })
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]?.sourceId).toBe("memory")
  })

  test("integrates with ContextAssembler end-to-end", async () => {
    const s = svc()
    await s.write({ tier: "long", content: "postgres migration via drizzle" })
    await s.write({ tier: "long", content: "unrelated cooking recipe" })
    const src = new MemoryContextSource({ service: s })
    const assembler = new ContextAssembler({
      collector: new MultiSourceCollector([src]),
    })
    const ctx = await assembler.assemble({
      goal: "postgres migration plan",
      expectedOutput: "plan",
    })
    expect(ctx.items.length).toBeGreaterThan(0)
    expect(ctx.relevantData[0]?.content).toContain("postgres")
  })

  test("respects sessionId when provided via request.hints", async () => {
    const s = svc()
    await s.write({ tier: "short", sessionId: "sess-1", content: "session fact" })
    const src = new MemoryContextSource({
      service: s,
      sessionIdFrom: (req) => (req.agentId ? "sess-1" : undefined),
    })
    const items = await src.collect({
      goal: "session fact",
      expectedOutput: "x",
      agentId: "a",
    })
    expect(items.some((i) => i.content.includes("session fact"))).toBe(true)
  })
})
