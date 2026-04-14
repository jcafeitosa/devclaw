import { describe, expect, test } from "bun:test"

import { makeOllamaAdapter } from "../../src/provider/ollama_adapter.ts"

function asRequest(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Request {
  if (input instanceof Request) return new Request(input, init)
  return new Request(String(input), init)
}

describe("OllamaAdapter", () => {
  test("calls OpenAI-compatible chat endpoint through AI SDK and returns text", async () => {
    let seenAuth = ""
    let seenPath = ""
    let seenBody = ""
    const adapter = makeOllamaAdapter({
      apiKey: "ollama-key",
      baseUrl: "http://ollama.example.test/v1",
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
            model: "llama3.2",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "ollama says hi" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    })

    const out = await adapter.generate({ prompt: "hello ollama", temperature: 0.2 })
    expect(out).toBe("ollama says hi")
    expect(seenAuth).toBe("Bearer ollama-key")
    expect(seenPath).toBe("/v1/chat/completions")
    expect(seenBody).toContain("hello ollama")
  })
})
