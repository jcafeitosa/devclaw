import { afterEach, describe, expect, test } from "bun:test"
import { ProviderError } from "../../src/provider/catalog.ts"
import { makeOpenAIAdapter } from "../../src/provider/openai_adapter.ts"

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
  return { baseUrl: "http://mock-openai.test", fetchFn }
}

describe("OpenAIAdapter", () => {
  test("calls /v1/chat/completions with bearer and returns content", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({
            id: "cmpl_1",
            choices: [{ message: { role: "assistant", content: "hello" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeOpenAIAdapter({ apiKey: "sk-openai", baseUrl, fetch: fetchFn })
    const out = await adapter.generate({ prompt: "Hi", model: "gpt-4o-mini" })
    expect(out).toBe("hello")
    expect(lastRequest?.headers.authorization).toBe("Bearer sk-openai")
    const body = lastRequest?.body as {
      model: string
      messages: { role: string; content: string }[]
    }
    expect(body.model).toBe("gpt-4o-mini")
    expect(body.messages[body.messages.length - 1]).toEqual({ role: "user", content: "Hi" })
  })

  test("prepends system message when system opt provided", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({ id: "c", choices: [{ message: { role: "assistant", content: "k" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeOpenAIAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    await adapter.generate({ prompt: "x", system: "sys" })
    const body = lastRequest?.body as { messages: { role: string; content: string }[] }
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" })
    expect(body.messages[1]).toEqual({ role: "user", content: "x" })
  })

  test("throws ProviderError on 4xx", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    )
    const adapter = makeOpenAIAdapter({ apiKey: "bad", baseUrl, fetch: fetchFn })
    await expect(adapter.generate({ prompt: "x" })).rejects.toBeInstanceOf(ProviderError)
  })

  test("empty content falls back to empty string", async () => {
    const { baseUrl, fetchFn } = startMock(
      () =>
        new Response(
          JSON.stringify({ id: "c", choices: [{ message: { role: "assistant", content: null } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const adapter = makeOpenAIAdapter({ apiKey: "k", baseUrl, fetch: fetchFn })
    expect(await adapter.generate({ prompt: "x" })).toBe("")
  })
})
