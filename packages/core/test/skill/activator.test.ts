import { describe, expect, test } from "bun:test"
import { SkillActivator } from "../../src/skill/activator.ts"
import { parseSkillMarkdown } from "../../src/skill/parser.ts"
import { SkillRegistry } from "../../src/skill/registry.ts"

function skill(frontmatter: string) {
  return parseSkillMarkdown("fallback", `---\n${frontmatter}\n---\nbody`)
}

describe("SkillActivator", () => {
  test("matches by trigger + tags + description", () => {
    const reg = new SkillRegistry()
    reg.register(
      skill(
        `name: migrate_db\nstatus: active\ntriggers: [migration, schema]\ntags: [db]\ndescription: Postgres schema migration helper`,
      ),
    )
    reg.register(
      skill(
        `name: ui_fix\nstatus: active\ntriggers: [styling]\ntags: [frontend]\ndescription: CSS fixes`,
      ),
    )
    const activator = new SkillActivator(reg)
    const matches = activator.activate({ goal: "postgres schema migration", tags: ["db"] })
    expect(matches[0]?.skill.id).toBe("migrate_db")
    expect(matches[0]?.reasons.some((r) => r.startsWith("trigger:"))).toBe(true)
  })

  test("excludes non-active skills by default", () => {
    const reg = new SkillRegistry()
    reg.register(
      skill(
        `name: old\nstatus: deprecated\ntriggers: [postgres]\ndescription: legacy postgres helper`,
      ),
    )
    const activator = new SkillActivator(reg)
    expect(activator.activate({ goal: "postgres migration" })).toEqual([])
  })

  test("includeDeprecated flag surfaces them with warning reason", () => {
    const reg = new SkillRegistry()
    reg.register(
      skill(
        `name: old\nstatus: deprecated\ntriggers: [postgres]\ndescription: legacy postgres helper`,
      ),
    )
    const activator = new SkillActivator(reg)
    const [match] = activator.activate({
      goal: "postgres migration",
      includeDeprecated: true,
    })
    expect(match?.reasons).toContain("warning:deprecated")
  })

  test("returns empty when nothing matches", () => {
    const reg = new SkillRegistry()
    reg.register(
      skill(`name: x\nstatus: active\ntriggers: [cooking]\ntags: [chef]\ndescription: recipes`),
    )
    const activator = new SkillActivator(reg)
    expect(activator.activate({ goal: "postgres migration" })).toEqual([])
  })

  test("limit caps result count", () => {
    const reg = new SkillRegistry()
    for (let i = 0; i < 6; i++) {
      reg.register(
        skill(`name: s${i}\nstatus: active\ntriggers: [postgres]\ndescription: sample ${i}`),
      )
    }
    const activator = new SkillActivator(reg)
    expect(activator.activate({ goal: "postgres", limit: 3 })).toHaveLength(3)
  })
})
