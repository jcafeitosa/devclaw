import { describe, expect, test } from "bun:test"
import type { ContextObject } from "../../src/context/types.ts"
import { PromptBuilder } from "../../src/prompt/builder.ts"
import { TemplateRegistry } from "../../src/prompt/registry.ts"
import {
  DEVCLAW_DEFAULT_TEMPLATE,
  registerDefaultTemplates,
} from "../../src/prompt/templates/default.ts"

describe("devclaw-default template", () => {
  test("registers via helper", () => {
    const reg = registerDefaultTemplates(new TemplateRegistry())
    expect(reg.get("devclaw-default").version).toBe(DEVCLAW_DEFAULT_TEMPLATE.version)
  })

  test("renders full ContextObject into structured prompt", () => {
    const reg = registerDefaultTemplates(new TemplateRegistry())
    const b = new PromptBuilder({ registry: reg, defaultTemplateId: "devclaw-default" })
    const ctx: ContextObject = {
      goal: "add OAuth bridge",
      expectedOutput: "implementation plan",
      background: "need subscription auth",
      constraints: ["no new runtime deps", "support refresh"],
      dependencies: ["@devclaw/core/auth"],
      risks: ["token leak"],
      relevantData: [
        { id: "doc1", sourceId: "vault", kind: "doc", content: "PKCE uses SHA-256." },
        { id: "doc2", sourceId: "vault", kind: "doc", content: "Bind 127.0.0.1 only." },
      ],
      items: [],
      diagnostics: [],
      totals: { items: 2, tokens: 50 },
    }
    const prompt = b.build(ctx)
    const user = prompt.messages[0]?.content ?? ""
    expect(prompt.system).toContain("add OAuth bridge")
    expect(user).toContain("Expected output: implementation plan")
    expect(user).toContain("- no new runtime deps")
    expect(user).toContain("- @devclaw/core/auth")
    expect(user).toContain("- token leak")
    expect(user).toContain("PKCE uses SHA-256.")
    expect(user).toContain("Bind 127.0.0.1 only.")
    expect(user).toContain("[vault] doc1")
  })

  test("omits empty sections (no constraints → no Constraints header)", () => {
    const reg = registerDefaultTemplates(new TemplateRegistry())
    const b = new PromptBuilder({ registry: reg, defaultTemplateId: "devclaw-default" })
    const prompt = b.build({
      goal: "g",
      expectedOutput: "x",
      constraints: [],
      dependencies: [],
      risks: [],
      relevantData: [],
      items: [],
      diagnostics: [],
      totals: { items: 0, tokens: 0 },
    })
    const user = prompt.messages[0]?.content ?? ""
    expect(user).not.toContain("## Constraints")
    expect(user).not.toContain("## Dependencies")
    expect(user).not.toContain("## Relevant context")
  })
})
