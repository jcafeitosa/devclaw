import { describe, expect, test } from "bun:test"

import { makeGoogleAdapter } from "../../src/provider/google_adapter.ts"

function asRequest(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Request {
  if (input instanceof Request) return new Request(input, init)
  return new Request(String(input), init)
}

describe("GoogleAdapter", () => {
  test("calls Google provider through AI SDK and returns text", async () => {
    let seenAuth = ""
    let seenPath = ""
    let seenBody = ""
    const adapter = makeGoogleAdapter({
      apiKey: "google-key",
      baseUrl: "https://google.example.test/v1beta",
      fetch: async (input, init) => {
        const req = asRequest(input, init)
        seenAuth = req.headers.get("x-goog-api-key") ?? ""
        seenPath = new URL(req.url).pathname
        seenBody = await req.text()
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "google says hi" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 3,
              candidatesTokenCount: 4,
              totalTokenCount: 7,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    })

    const out = await adapter.generate({ prompt: "hello google", system: "be terse" })
    expect(out).toBe("google says hi")
    expect(seenAuth).toBe("google-key")
    expect(seenPath).toContain("/models/")
    expect(seenPath).toContain(":generateContent")
    expect(seenBody).toContain("hello google")
  })
})
