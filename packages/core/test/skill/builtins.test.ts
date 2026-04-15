import { describe, test, expect } from "bun:test"
import { SkillRegistry } from "../../src/skill/registry.ts"
import { join } from "node:path"

describe("Skill builtins (agents)", () => {
  test("builtins directory has 14 role prompts", async () => {
    const dir = join(process.cwd(), "packages/core/src/skill/builtins/agents")
    const r = new SkillRegistry()
    const { loaded } = await r.loadFromDir(dir)
    expect(loaded.length).toBe(14)
  })
})
