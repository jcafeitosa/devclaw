import { describe, expect, test } from "bun:test"
import type { ContextObject } from "../../src/context/types.ts"
import { PromptBuilder } from "../../src/prompt/builder.ts"
import { TemplateRegistry } from "../../src/prompt/registry.ts"

const sampleTemplate = {
  id: "devclaw-default",
  version: "1.0.0",
  system: "You are a senior engineer. Task: {{goal}}",
  user: `Goal: {{goal}}
Expected output: {{expectedOutput}}
{{#if constraints}}Constraints:
{{#each constraints}}- {{.}}
{{/each}}{{/if}}{{#if relevantData}}Context:
{{#each relevantData}}[{{sourceId}}] {{content}}
{{/each}}{{/if}}`,
}

function makeContext(overrides: Partial<ContextObject> = {}): ContextObject {
  return {
    goal: "migrate db",
    expectedOutput: "migration plan",
    background: undefined,
    constraints: ["no downtime"],
    dependencies: [],
    risks: [],
    relevantData: [{ id: "k1", sourceId: "kb", kind: "doc", content: "postgres docs" }],
    items: [],
    diagnostics: [],
    totals: { items: 1, tokens: 10 },
    ...overrides,
  }
}

describe("PromptBuilder", () => {
  test("builds RenderedPrompt from ContextObject using default template", () => {
    const reg = new TemplateRegistry()
    reg.register(sampleTemplate)
    const b = new PromptBuilder({ registry: reg, defaultTemplateId: "devclaw-default" })
    const out = b.build(makeContext())
    expect(out.templateId).toBe("devclaw-default")
    expect(out.system).toContain("migrate db")
    expect(out.messages).toHaveLength(1)
    expect(out.messages[0]?.role).toBe("user")
    expect(out.messages[0]?.content).toContain("Goal: migrate db")
    expect(out.messages[0]?.content).toContain("postgres docs")
    expect(out.cacheKey.length).toBeGreaterThan(10)
  })

  test("same context → same cacheKey (deterministic)", () => {
    const reg = new TemplateRegistry()
    reg.register(sampleTemplate)
    const b = new PromptBuilder({ registry: reg, defaultTemplateId: "devclaw-default" })
    const a = b.build(makeContext())
    const c = b.build(makeContext())
    expect(a.cacheKey).toBe(c.cacheKey)
  })

  test("different context → different cacheKey", () => {
    const reg = new TemplateRegistry()
    reg.register(sampleTemplate)
    const b = new PromptBuilder({ registry: reg, defaultTemplateId: "devclaw-default" })
    const a = b.build(makeContext())
    const c = b.build(makeContext({ goal: "different goal" }))
    expect(a.cacheKey).not.toBe(c.cacheKey)
  })

  test("accepts extra variables", () => {
    const reg = new TemplateRegistry()
    reg.register({
      id: "t",
      version: "1.0.0",
      user: "{{goal}} / {{extra}}",
    })
    const b = new PromptBuilder({ registry: reg, defaultTemplateId: "t" })
    const out = b.build(makeContext(), { variables: { extra: "XYZ" } })
    expect(out.messages[0]?.content).toContain("XYZ")
  })

  test("accepts explicit templateId override", () => {
    const reg = new TemplateRegistry()
    reg.register({ id: "a", version: "1.0.0", user: "a: {{goal}}" })
    reg.register({ id: "b", version: "1.0.0", user: "b: {{goal}}" })
    const b = new PromptBuilder({ registry: reg, defaultTemplateId: "a" })
    expect(b.build(makeContext(), { templateId: "b" }).messages[0]?.content).toContain("b:")
  })
})
