import { afterEach, describe, expect, test } from "bun:test"
import { makeAnthropicAdapter } from "../../src/provider/anthropic_adapter.ts"
import { ProviderCatalog } from "../../src/provider/catalog.ts"
import { makeOpenAIAdapter } from "../../src/provider/openai_adapter.ts"

let lastRequest: { headers: Record<string, string>; body: unknown } | null = null

afterEach(() => {
  lastRequest = null
})

function startMock(respond: () => Response) {
  const fetchFn = async (_input: string | URL | Request, init?: RequestInit | BunFetchRequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as unknown
    const headers: Record<string, string> = {}
    if (init?.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headers[k] = v
      })
    } else if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers)) headers[k] = String(v)
    }
    lastRequest = { headers, body }
    return respond()
  }
  return { baseUrl: "http://mock-provider.test", fetchFn }
}

describe("Anthropic — generateWithUsage + prompt cache", () => {
  test("returns text + model + usage.{input,output}_tokens", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "msg_1",
            model: "claude-sonnet-4-5-20251001",
            content: [{ type: "text", text: "hello" }],
            usage: { input_tokens: 42, output_tokens: 7 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    const res = await adapter.generateWithUsage!({ prompt: "hi" })
    expect(res.text).toBe("hello")
    expect(res.model).toBe("claude-sonnet-4-5-20251001")
    expect(res.usage.input_tokens).toBe(42)
    expect(res.usage.output_tokens).toBe(7)
  })

  test("cacheSystem:true sends system as content block with cache_control ephemeral", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "msg_2",
            model: "claude-sonnet-4-5-20251001",
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 5, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    await adapter.generateWithUsage!({ prompt: "x", system: "you are helpful", cacheSystem: true })
    const body = lastRequest?.body as {
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>
    }
    expect(Array.isArray(body.system)).toBe(true)
    expect(body.system[0]).toEqual({
      type: "text",
      text: "you are helpful",
      cache_control: { type: "ephemeral" },
    })
  })

  test("cacheSystem omitted sends system as plain string (backward compat)", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "msg_2b",
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    await adapter.generateWithUsage!({ prompt: "x", system: "legacy" })
    const body = lastRequest?.body as { system: unknown }
    expect(body.system).toBe("legacy")
  })

  test("captures cache_read_input_tokens + cache_creation_input_tokens", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "msg_3",
            model: "claude-sonnet-4-5-20251001",
            content: [{ type: "text", text: "cached" }],
            usage: {
              input_tokens: 10,
              output_tokens: 3,
              cache_read_input_tokens: 900,
              cache_creation_input_tokens: 0,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    const res = await adapter.generateWithUsage!({ prompt: "x" })
    expect(res.usage.cache_read_input_tokens).toBe(900)
    expect(res.usage.cache_creation_input_tokens).toBe(0)
  })

  test("generate() backward-compat returns text string only", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "msg_4",
            content: [{ type: "text", text: "legacy" }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    expect(await adapter.generate({ prompt: "x" })).toBe("legacy")
  })
})

describe("OpenAI — generateWithUsage", () => {
  test("returns text + model + usage (input/output/cache)", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "cmpl_1",
            model: "gpt-4o-mini",
            choices: [{ message: { role: "assistant", content: "hi" } }],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 5,
              prompt_tokens_details: { cached_tokens: 15 },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeOpenAIAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    const res = await adapter.generateWithUsage!({ prompt: "x" })
    expect(res.text).toBe("hi")
    expect(res.model).toBe("gpt-4o-mini")
    expect(res.usage.input_tokens).toBe(20)
    expect(res.usage.output_tokens).toBe(5)
    expect(res.usage.prompt_cache_tokens).toBe(15)
  })

  test("handles missing prompt_tokens_details gracefully (no cache info)", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "cmpl_2",
            model: "gpt-4o-mini",
            choices: [{ message: { role: "assistant", content: "no cache" } }],
            usage: { prompt_tokens: 8, completion_tokens: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeOpenAIAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    const res = await adapter.generateWithUsage!({ prompt: "x" })
    expect(res.usage.input_tokens).toBe(8)
    expect(res.usage.output_tokens).toBe(2)
    expect(res.usage.prompt_cache_tokens).toBeUndefined()
  })
})

describe("ProviderCatalog.generateWithUsage", () => {
  test("delegates to descriptor when implemented", async () => {
    const c = new ProviderCatalog()
    c.register({
      id: "withUsage",
      name: "With Usage",
      baseUrl: "http://x",
      defaultModel: "m-1",
      generate: async ({ prompt }) => `t:${prompt}`,
      generateWithUsage: async ({ prompt, model }) => ({
        text: `t:${prompt}`,
        model: model ?? "m-1",
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
    })
    const res = await c.generateWithUsage("withUsage", { prompt: "ping" })
    expect(res.text).toBe("t:ping")
    expect(res.usage.input_tokens).toBe(3)
    expect(res.usage.output_tokens).toBe(2)
  })

  test("falls back to legacy generate() with zero usage when descriptor has no generateWithUsage", async () => {
    const c = new ProviderCatalog()
    c.register({
      id: "legacy",
      name: "Legacy",
      baseUrl: "http://x",
      defaultModel: "l-1",
      generate: async ({ prompt }) => `legacy:${prompt}`,
    })
    const res = await c.generateWithUsage("legacy", { prompt: "ping" })
    expect(res.text).toBe("legacy:ping")
    expect(res.model).toBe("l-1")
    expect(res.usage.input_tokens).toBe(0)
    expect(res.usage.output_tokens).toBe(0)
  })
})
