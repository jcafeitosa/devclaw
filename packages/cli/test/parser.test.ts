import { describe, expect, test } from "bun:test"
import { parseArgs } from "../src/parser.ts"

describe("parseArgs", () => {
  test("extracts subcommand as first positional", () => {
    const r = parseArgs(["discover"])
    expect(r.command).toBe("discover")
    expect(r.positional).toEqual([])
  })

  test("remaining positionals follow subcommand", () => {
    const r = parseArgs(["invoke", "extra1", "extra2"])
    expect(r.command).toBe("invoke")
    expect(r.positional).toEqual(["extra1", "extra2"])
  })

  test("--flag value syntax", () => {
    const r = parseArgs(["invoke", "--prompt", "hi there"])
    expect(r.flags.prompt).toBe("hi there")
  })

  test("--flag=value syntax", () => {
    const r = parseArgs(["invoke", "--prompt=hi"])
    expect(r.flags.prompt).toBe("hi")
  })

  test("boolean flag defaults to true when no value", () => {
    const r = parseArgs(["invoke", "--verbose"])
    expect(r.flags.verbose).toBe(true)
  })

  test("--no-flag sets false", () => {
    const r = parseArgs(["invoke", "--no-color"])
    expect(r.flags.color).toBe(false)
  })

  test("short flag -k mapped when known", () => {
    const r = parseArgs(["login", "-k", "sk-abc"], { shortMap: { k: "key" } })
    expect(r.flags.key).toBe("sk-abc")
  })

  test("missing command → empty string", () => {
    const r = parseArgs([])
    expect(r.command).toBe("")
  })

  test("-- terminates flag parsing", () => {
    const r = parseArgs(["invoke", "--prompt", "hi", "--", "--literal"])
    expect(r.flags.prompt).toBe("hi")
    expect(r.positional).toContain("--literal")
  })

  test("numeric string left as string (consumer parses)", () => {
    const r = parseArgs(["invoke", "--max-tokens", "500"])
    expect(r.flags["max-tokens"]).toBe("500")
  })
})
