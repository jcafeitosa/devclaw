import { afterEach, describe, expect, test } from "bun:test"
import { makeAnthropicAdapter } from "../../src/provider/anthropic_adapter.ts"
import { ProviderError } from "../../src/provider/catalog.ts"

let lastRequest: { headers: Record<string, string>; body: unknown } | null = null

afterEach(() => {
  lastRequest = null
})

function startMock(respond: () => Response) {
  const fetchFn = async (
    _input: string | URL | Request,
    init?: RequestInit | BunFetchRequestInit,
  ) => {
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
  return { baseUrl: "http://mock-anthropic.test", fetchFn }
}

describe("AnthropicAdapter", () => {
  test("calls /v1/messages with x-api-key and returns text", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "msg_1",
            content: [{ type: "text", text: "Hello world" }],
            stop_reason: "end_turn",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "sk-ant-test", baseUrl, fetch: fetchFn as unknown as typeof fetch })
    const out = await adapter.generate({ prompt: "Hi", model: "claude-3-5-sonnet" })
    expect(out).toBe("Hello world")
    expect(lastRequest?.headers["x-api-key"]).toBe("sk-ant-test")
    expect(lastRequest?.headers["anthropic-version"]).toBeDefined()
    const body = lastRequest?.body as {
      model: string
      messages: { role: string; content: string }[]
      max_tokens: number
    }
    expect(body.model).toBe("claude-3-5-sonnet")
    expect(body.messages[0]).toEqual({ role: "user", content: "Hi" })
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  test("includes system prompt when provided", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(JSON.stringify({ id: "msg_2", content: [{ type: "text", text: "ok" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    await adapter.generate({ prompt: "x", system: "you are helpful" })
    const body = lastRequest?.body as { system: string }
    expect(body.system).toBe("you are helpful")
  })

  test("concatenates multiple text blocks", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "msg_3",
            content: [
              { type: "text", text: "part1 " },
              { type: "text", text: "part2" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    expect(await adapter.generate({ prompt: "x" })).toBe("part1 part2")
  })

  test("throws ProviderError on 4xx", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(JSON.stringify({ error: { type: "invalid_request" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    )
    const adapter = makeAnthropicAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    await expect(adapter.generate({ prompt: "x" })).rejects.toBeInstanceOf(ProviderError)
  })
})
