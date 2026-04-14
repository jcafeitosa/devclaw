import { describe, expect, test } from "bun:test"
import { parseSkillMarkdown } from "../../src/skill/parser.ts"
import { ProgressiveLoader } from "../../src/skill/progressive_loader.ts"
import { SkillRegistry } from "../../src/skill/registry.ts"

function fixture() {
  const reg = new SkillRegistry()
  reg.register(
    parseSkillMarkdown(
      "exec",
      `---
name: execute_trade
version: 1.2.0
status: active
description: Execute a trade
tags: [trading]
triggers: [trade]
steps: [validate, execute, audit]
tools: [exchange_api]
---
body with many details`,
    ),
  )
  return { reg, loader: new ProgressiveLoader(reg) }
}

describe("ProgressiveLoader", () => {
  test("listMetadata returns lightweight view (no body)", () => {
    const { loader } = fixture()
    const list = loader.listMetadata()
    expect(list[0]?.id).toBe("execute_trade")
    // metadata interface does not expose body
    expect((list[0] as unknown as { body?: string }).body).toBeUndefined()
  })

  test("metadata(id) returns metadata without loading body", () => {
    const { loader } = fixture()
    const m = loader.metadata("execute_trade")
    expect(m.tags).toContain("trading")
    expect((m as unknown as { body?: string }).body).toBeUndefined()
  })

  test("expand returns body + steps + inputs and caches", () => {
    const { loader } = fixture()
    const a = loader.expand("execute_trade")
    const b = loader.expand("execute_trade")
    expect(a).toBe(b)
    expect(a.body).toContain("body with many details")
    expect(a.steps).toEqual(["validate", "execute", "audit"])
  })

  test("invalidate forces re-expansion", () => {
    const { loader } = fixture()
    const first = loader.expand("execute_trade")
    loader.invalidate("execute_trade")
    const second = loader.expand("execute_trade")
    expect(second).not.toBe(first)
  })

  test("has returns boolean instead of throwing", () => {
    const { loader } = fixture()
    expect(loader.has("execute_trade")).toBe(true)
    expect(loader.has("missing")).toBe(false)
  })
})
