import { describe, expect, test } from "bun:test"
import { LSPRegistry, LSPServerNotFoundError } from "../../src/lsp/registry.ts"

describe("LSPRegistry", () => {
  test("registers server config and resolves by language", () => {
    const r = new LSPRegistry()
    r.register("typescript", { command: ["typescript-language-server", "--stdio"] })
    expect(r.get("typescript").command).toEqual(["typescript-language-server", "--stdio"])
  })

  test("get unknown language throws LSPServerNotFoundError", () => {
    const r = new LSPRegistry()
    expect(() => r.get("ghost")).toThrow(LSPServerNotFoundError)
  })

  test("list returns registered languages", () => {
    const r = new LSPRegistry()
    r.register("ts", { command: ["a"] })
    r.register("py", { command: ["b"] })
    expect(r.languages().sort()).toEqual(["py", "ts"])
  })
})
