import { describe, expect, test } from "bun:test"
import { TemplateNotFoundError } from "../../src/prompt/errors.ts"
import { TemplateRegistry } from "../../src/prompt/registry.ts"

describe("TemplateRegistry", () => {
  test("register + get latest by id", () => {
    const r = new TemplateRegistry()
    r.register({ id: "t", version: "1.0.0", user: "one" })
    r.register({ id: "t", version: "1.1.0", user: "oneone" })
    r.register({ id: "t", version: "2.0.0", user: "two" })
    expect(r.get("t").user).toBe("two")
  })

  test("get specific version", () => {
    const r = new TemplateRegistry()
    r.register({ id: "t", version: "1.0.0", user: "one" })
    r.register({ id: "t", version: "2.0.0", user: "two" })
    expect(r.get("t", "1.0.0").user).toBe("one")
  })

  test("get unknown id throws TemplateNotFoundError", () => {
    const r = new TemplateRegistry()
    expect(() => r.get("x")).toThrow(TemplateNotFoundError)
  })

  test("get unknown version throws TemplateNotFoundError", () => {
    const r = new TemplateRegistry()
    r.register({ id: "t", version: "1.0.0", user: "x" })
    expect(() => r.get("t", "9.9.9")).toThrow(TemplateNotFoundError)
  })

  test("list returns all registered entries", () => {
    const r = new TemplateRegistry()
    r.register({ id: "a", version: "1.0.0", user: "x" })
    r.register({ id: "b", version: "1.0.0", user: "y" })
    expect(
      r
        .list()
        .map((t) => t.id)
        .sort(),
    ).toEqual(["a", "b"])
  })

  test("re-register same id+version throws", () => {
    const r = new TemplateRegistry()
    r.register({ id: "t", version: "1.0.0", user: "x" })
    expect(() => r.register({ id: "t", version: "1.0.0", user: "y" })).toThrow(/already/i)
  })

  test("versions() returns sorted list for id", () => {
    const r = new TemplateRegistry()
    r.register({ id: "t", version: "1.0.0", user: "" })
    r.register({ id: "t", version: "2.1.0", user: "" })
    r.register({ id: "t", version: "2.0.0", user: "" })
    expect(r.versions("t")).toEqual(["1.0.0", "2.0.0", "2.1.0"])
  })
})
