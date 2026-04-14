import { describe, expect, test } from "bun:test"
import { CommandParseError } from "../../src/slash/errors.ts"
import { parseFrontmatterMarkdown } from "../../src/slash/frontmatter.ts"

describe("parseFrontmatterMarkdown", () => {
  test("no frontmatter → empty fm + full body", () => {
    const { frontmatter, body } = parseFrontmatterMarkdown("hello\nworld")
    expect(frontmatter).toEqual({})
    expect(body).toBe("hello\nworld")
  })

  test("parses string, number, boolean scalars", () => {
    const text = `---
name: architect
version: 1.2
strict: true
enabled: false
---
body here`
    const { frontmatter, body } = parseFrontmatterMarkdown(text)
    expect(frontmatter.name).toBe("architect")
    expect(frontmatter.version).toBe(1.2)
    expect(frontmatter.strict).toBe(true)
    expect(frontmatter.enabled).toBe(false)
    expect(body).toBe("body here")
  })

  test("parses inline array", () => {
    const text = `---
agents: [architect, backend, qa]
---
`
    expect(parseFrontmatterMarkdown(text).frontmatter.agents).toEqual([
      "architect",
      "backend",
      "qa",
    ])
  })

  test("parses list of primitives (block style)", () => {
    const text = `---
tools:
  - Read
  - Write
  - Bash
---
`
    expect(parseFrontmatterMarkdown(text).frontmatter.tools).toEqual(["Read", "Write", "Bash"])
  })

  test("parses list of objects (arg specs)", () => {
    const text = `---
args:
  - name: scope
    type: string
    required: true
  - name: strict
    type: boolean
    default: false
---
`
    const args = parseFrontmatterMarkdown(text).frontmatter.args as Array<Record<string, unknown>>
    expect(args[0]).toEqual({ name: "scope", type: "string", required: true })
    expect(args[1]).toEqual({ name: "strict", type: "boolean", default: false })
  })

  test("parses nested map (hooks)", () => {
    const text = `---
hooks:
  pre: scripts/pre.sh
  post: scripts/post.sh
---
`
    expect(parseFrontmatterMarkdown(text).frontmatter.hooks).toEqual({
      pre: "scripts/pre.sh",
      post: "scripts/post.sh",
    })
  })

  test("quoted strings preserve special chars", () => {
    const text = `---
description: "a: description with: colons"
---
`
    expect(parseFrontmatterMarkdown(text).frontmatter.description).toBe(
      "a: description with: colons",
    )
  })

  test("unterminated frontmatter throws", () => {
    expect(() => parseFrontmatterMarkdown("---\nname: x\n")).toThrow(CommandParseError)
  })
})
