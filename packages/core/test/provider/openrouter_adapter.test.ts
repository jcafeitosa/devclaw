import { describe, expect, test } from "bun:test"

import { makeOpenRouterAdapter } from "../../src/provider/openrouter_adapter.ts"

function asRequest(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Request {
  if (input instanceof Request) return new Request(input, init)
  return new Request(String(input), init)
}

describe("OpenRouterAdapter", () => {
  test("calls OpenAI-compatible endpoint and returns text", async () => {
    let seenAuth = ""
    let seenBody = ""
    let seenPath = ""
    const adapter = makeOpenRouterAdapter({
      apiKey: "router-key",
      baseUrl: "https://openrouter.example.test/api/v1",
      fetch: async (input, init) => {
        const req = asRequest(input, init)
        seenAuth = req.headers.get("authorization") ?? ""
        seenPath = new URL(req.url).pathname
        seenBody = await req.text()
        return new Response(
          JSON.stringify({
            id: "chatcmpl-1",
            object: "chat.completion",
            created: 1,
            model: "openrouter/model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "openrouter says hi" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    })

    const out = await adapter.generate({ prompt: "hello router", system: "be terse" })
    expect(out).toBe("openrouter says hi")
    expect(seenAuth).toBe("Bearer router-key")
    expect(seenPath).toBe("/api/v1/chat/completions")
    expect(seenBody).toContain("hello router")
  })
})
