import { describe, expect, test } from "bun:test"
import type { GenerateOpts, GenerateResult, ProviderDescriptor } from "../../src/provider/catalog"
import { ProviderCatalog } from "../../src/provider/catalog"

// RED: ProviderCatalog should expose generateBatch (not implemented yet)
describe("C-04: Provider batch API (RED)", () => {
  test("ProviderCatalog.generateBatch processes multiple prompts", async () => {
    const catalog = new ProviderCatalog()
    const mockProvider: ProviderDescriptor = {
      id: "mock",
      name: "Mock",
      baseUrl: "http://mock",
      defaultModel: "m1",
      generateWithUsage: async (opts: GenerateOpts): Promise<GenerateResult> => ({
        text: `ok: ${opts.prompt}`,
        model: "m1",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      generate: async (opts: GenerateOpts) => `ok: ${opts.prompt}`,
    }
    catalog.register(mockProvider)

    const inputs: GenerateOpts[] = [{ prompt: "one" }, { prompt: "two" }]

    // Should fail until generateBatch is implemented
    const res = await (
      catalog as unknown as {
        generateBatch: (id: string, inputs: GenerateOpts[]) => Promise<GenerateResult[]>
      }
    ).generateBatch("mock", inputs)

    expect(Array.isArray(res)).toBe(true)
    expect(res.length).toBe(2)
    expect(res[0]!.text).toBe("ok: one")
  })
})
