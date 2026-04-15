import { describe, test, expect } from "bun:test"
import { ProviderCatalog } from "../../src/provider/catalog"

// RED: ProviderCatalog should expose generateBatch (not implemented yet)
describe("C-04: Provider batch API (RED)", () => {
  test("ProviderCatalog.generateBatch processes multiple prompts", async () => {
    const catalog = new ProviderCatalog()
    const mockProvider = {
      id: "mock",
      name: "Mock",
      baseUrl: "http://mock",
      defaultModel: "m1",
      generateWithUsage: async (opts: any) => ({ text: `ok: ${opts.prompt}`, model: "m1", usage: { input_tokens: 1, output_tokens: 1 } }),
      generate: async (opts: any) => `ok: ${opts.prompt}`,
    }
    catalog.register(mockProvider as any)

    const inputs = [{ prompt: "one" }, { prompt: "two" }]

    // Should fail until generateBatch is implemented
    // @ts-expect-error
    const res = await (catalog as any).generateBatch("mock", inputs)

    expect(Array.isArray(res)).toBe(true)
    expect(res.length).toBe(2)
    expect(res[0].text).toBe("ok: one")
  })
})
