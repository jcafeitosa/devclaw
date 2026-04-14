import { describe, expect, test } from "bun:test"
import { CommandParseError, CommandValidationError } from "../../src/slash/errors.ts"
import { parseInvocation, validateInvocation } from "../../src/slash/invocation.ts"
import type { SlashDefinition } from "../../src/slash/types.ts"

describe("parseInvocation", () => {
  test("extracts name and positional", () => {
    const inv = parseInvocation("/architect auth")
    expect(inv.name).toBe("architect")
    expect(inv.positional).toEqual(["auth"])
  })

  test("parses --flag value and --flag=value", () => {
    const inv = parseInvocation("/tdd --min-coverage 90 --strict=true")
    expect(inv.flags["min-coverage"]).toBe("90")
    expect(inv.flags.strict).toBe("true")
  })

  test("--no-flag sets false", () => {
    const inv = parseInvocation("/code-review --no-auto-fix")
    expect(inv.flags["auto-fix"]).toBe(false)
  })

  test("bare --flag becomes boolean true", () => {
    const inv = parseInvocation("/test --watch")
    expect(inv.flags.watch).toBe(true)
  })

  test("quoted strings preserve spaces", () => {
    const inv = parseInvocation('/invoke --prompt "hello world"')
    expect(inv.flags.prompt).toBe("hello world")
  })

  test("missing leading / throws", () => {
    expect(() => parseInvocation("nope")).toThrow(CommandParseError)
  })

  test("empty name after / throws", () => {
    expect(() => parseInvocation("/")).toThrow(CommandParseError)
  })
})

describe("validateInvocation", () => {
  const def: SlashDefinition = {
    name: "architect",
    body: "",
    args: [
      { name: "scope", type: "string", required: true },
      { name: "strict", type: "boolean", default: false },
      { name: "max", type: "number" },
    ],
  }

  test("required arg missing throws CommandValidationError", () => {
    expect(() => validateInvocation(def, parseInvocation("/architect"))).toThrow(
      CommandValidationError,
    )
  })

  test("positional fills required arg", () => {
    const out = validateInvocation(def, parseInvocation("/architect auth"))
    expect(out.scope).toBe("auth")
    expect(out.strict).toBe(false)
  })

  test("flag overrides positional when both present", () => {
    const out = validateInvocation(def, parseInvocation("/architect auth --scope billing"))
    expect(out.scope).toBe("billing")
  })

  test("type coercion: number", () => {
    const out = validateInvocation(def, parseInvocation("/architect auth --max 42"))
    expect(out.max).toBe(42)
  })

  test("bad number coercion throws", () => {
    expect(() => validateInvocation(def, parseInvocation("/architect auth --max nope"))).toThrow(
      CommandValidationError,
    )
  })

  test("boolean coercion from string", () => {
    const out = validateInvocation(def, parseInvocation("/architect auth --strict true"))
    expect(out.strict).toBe(true)
  })

  test("default used when optional arg omitted", () => {
    const out = validateInvocation(def, parseInvocation("/architect auth"))
    expect(out.strict).toBe(false)
  })
})
