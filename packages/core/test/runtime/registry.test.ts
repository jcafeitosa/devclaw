import { describe, expect, test } from "bun:test"
import { LocalRuntime } from "../../src/runtime/local.ts"
import { RuntimeNotFoundError, RuntimeRegistry } from "../../src/runtime/registry.ts"

describe("RuntimeRegistry", () => {
  test("registers and resolves runtimes by name", () => {
    const reg = new RuntimeRegistry()
    const local = new LocalRuntime()
    reg.register("local", local)
    expect(reg.get("local")).toBe(local)
  })

  test("list returns registered names", () => {
    const reg = new RuntimeRegistry()
    reg.register("a", new LocalRuntime())
    reg.register("b", new LocalRuntime())
    expect(reg.list().sort()).toEqual(["a", "b"])
  })

  test("get throws RuntimeNotFoundError for unknown name", () => {
    const reg = new RuntimeRegistry()
    expect(() => reg.get("ghost")).toThrow(RuntimeNotFoundError)
  })

  test("default getter returns first registered runtime", () => {
    const reg = new RuntimeRegistry()
    const a = new LocalRuntime()
    const b = new LocalRuntime()
    reg.register("a", a)
    reg.register("b", b)
    expect(reg.default()).toBe(a)
  })

  test("default throws when registry is empty", () => {
    const reg = new RuntimeRegistry()
    expect(() => reg.default()).toThrow(RuntimeNotFoundError)
  })
})
