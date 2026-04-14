import { describe, expect, test } from "bun:test"
import { ProviderCatalog, type ProviderDescriptor } from "../../src/provider/catalog.ts"

const dummy: ProviderDescriptor = {
  id: "dummy",
  name: "Dummy",
  baseUrl: "https://dummy.test",
  defaultModel: "d-1",
  generate: async ({ prompt }) => `echo: ${prompt}`,
}

describe("ProviderCatalog", () => {
  test("register + get + list", () => {
    const c = new ProviderCatalog()
    c.register(dummy)
    expect(c.get("dummy")).toBe(dummy)
    expect(c.list().map((d) => d.id)).toEqual(["dummy"])
  })

  test("get throws on unknown id", () => {
    const c = new ProviderCatalog()
    expect(() => c.get("missing")).toThrow(/not registered/i)
  })

  test("register twice throws (explicit override required)", () => {
    const c = new ProviderCatalog()
    c.register(dummy)
    expect(() => c.register(dummy)).toThrow(/already/i)
  })

  test("generate delegates to descriptor", async () => {
    const c = new ProviderCatalog()
    c.register(dummy)
    const out = await c.generate("dummy", { prompt: "hi" })
    expect(out).toBe("echo: hi")
  })
})
