import { describe, expect, test } from "bun:test"
import { MissingVariableError } from "../../src/prompt/errors.ts"
import { render } from "../../src/prompt/renderer.ts"

describe("render", () => {
  test("substitutes simple variables", () => {
    expect(render("Hello, {{name}}!", { name: "world" })).toBe("Hello, world!")
  })

  test("missing required variable throws", () => {
    expect(() => render("Hello {{name}}", {})).toThrow(MissingVariableError)
  })

  test("optional variable {{var?}} renders empty when missing", () => {
    expect(render("x:{{y?}}:z", {})).toBe("x::z")
  })

  test("if block included when truthy", () => {
    expect(render("{{#if v}}yes{{/if}}", { v: true })).toBe("yes")
  })

  test("if block excluded when falsy (missing, false, empty)", () => {
    expect(render("{{#if v}}yes{{/if}}", { v: false })).toBe("")
    expect(render("{{#if v}}yes{{/if}}", {})).toBe("")
    expect(render("{{#if v}}yes{{/if}}", { v: "" })).toBe("")
    expect(render("{{#if v}}yes{{/if}}", { v: [] })).toBe("")
  })

  test("each iterates array with {{.}} for primitives", () => {
    expect(render("{{#each xs}}- {{.}}\n{{/each}}", { xs: ["a", "b"] })).toBe("- a\n- b\n")
  })

  test("each iterates array of objects with nested props", () => {
    const tpl = "{{#each items}}* {{name}}={{value}}\n{{/each}}"
    const out = render(tpl, {
      items: [
        { name: "x", value: "1" },
        { name: "y", value: "2" },
      ],
    })
    expect(out).toBe("* x=1\n* y=2\n")
  })

  test("if blocks compose with each", () => {
    const tpl = "{{#if items}}{{#each items}}{{.}} {{/each}}{{/if}}"
    expect(render(tpl, { items: ["a", "b"] })).toBe("a b ")
    expect(render(tpl, { items: [] })).toBe("")
  })

  test("preserves literal text outside placeholders", () => {
    expect(render("{ foo }: {{bar}}", { bar: "v" })).toBe("{ foo }: v")
  })

  test("numeric and boolean values stringified", () => {
    expect(render("{{n}}/{{b}}", { n: 42, b: true })).toBe("42/true")
  })
})
