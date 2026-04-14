import { describe, expect, test } from "bun:test"
import { GeminiManagedAgentsAdapter } from "../../../src/runtime/managed/gemini.ts"
import {
  ManagedAgentInterruptedError,
  ManagedAgentIterationLimitError,
  type ManagedAgentSpec,
} from "../../../src/runtime/managed/types.ts"

interface Captured {
  url: string
  body: unknown
  headers: Record<string, string>
}

function fakeFetch(responses: unknown[]) {
  const calls: Captured[] = []
  let idx = 0
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: (init?.headers as Record<string, string>) ?? {},
    })
    const next = responses[idx++]
    if (next === undefined) throw new Error("no more canned responses")
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch
  return { fn, calls }
}

function spec(over: Partial<ManagedAgentSpec> = {}): ManagedAgentSpec {
  return {
    model: "gemini-2.0-flash",
    messages: [{ role: "user", content: "hello" }],
    maxTokens: 1024,
    ...over,
  }
}

describe("GeminiManagedAgentsAdapter — kind + start", () => {
  test("kind reports 'gemini-managed'", () => {
    const a = new GeminiManagedAgentsAdapter({ apiKey: "k" })
    expect(a.kind).toBe("gemini-managed")
  })

  test("start returns final assistant text", async () => {
    const { fn, calls } = fakeFetch([
      {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "hi back" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      },
    ])
    const adapter = new GeminiManagedAgentsAdapter({ apiKey: "k", fetcher: fn })
    const session = await adapter.start(spec({ systemPrompt: "be terse" }))
    const result = await session.result()
    expect(result.text).toBe("hi back")
    expect(result.stopReason).toBe("STOP")
    expect(result.usage.input_tokens).toBe(5)
    expect(result.usage.output_tokens).toBe(2)
    const c = calls[0]!
    expect(c.url).toContain(":generateContent")
    expect(c.url).toContain("gemini-2.0-flash")
    expect(c.url).toContain("key=k")
    const body = c.body as {
      systemInstruction?: { parts: { text: string }[] }
      contents: unknown[]
    }
    expect(body.systemInstruction?.parts[0]?.text).toBe("be terse")
    expect(body.contents).toHaveLength(1)
  })
})

describe("GeminiManagedAgentsAdapter — function-calling loop", () => {
  test("dispatches functionCall parts and posts functionResponse back", async () => {
    const { fn } = fakeFetch([
      {
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                { text: "looking up" },
                { functionCall: { name: "search", args: { q: "cats" } } },
              ],
            },
            finishReason: "TOOL_USE",
          },
        ],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
      },
      {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "found 3 results" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3 },
      },
    ])
    const calls: { name: string; input: unknown }[] = []
    const adapter = new GeminiManagedAgentsAdapter({
      apiKey: "k",
      fetcher: fn,
      toolHandler: async (name, input) => {
        calls.push({ name, input })
        return { hits: 3 }
      },
    })
    const session = await adapter.start(
      spec({ tools: [{ name: "search", description: "s", input_schema: { type: "object" } }] }),
    )
    const result = await session.result()
    expect(calls).toEqual([{ name: "search", input: { q: "cats" } }])
    expect(result.text).toBe("found 3 results")
    expect(result.toolCalls).toBe(1)
  })

  test("aborts loop after maxIterations", async () => {
    const responses: unknown[] = []
    for (let i = 0; i < 10; i++) {
      responses.push({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name: "echo", args: {} } }],
            },
            finishReason: "TOOL_USE",
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      })
    }
    const { fn } = fakeFetch(responses)
    const adapter = new GeminiManagedAgentsAdapter({
      apiKey: "k",
      fetcher: fn,
      toolHandler: async () => ({}),
      maxIterations: 3,
    })
    const session = await adapter.start(
      spec({ tools: [{ name: "echo", description: "", input_schema: { type: "object" } }] }),
    )
    await expect(session.result()).rejects.toBeInstanceOf(ManagedAgentIterationLimitError)
  })
})

describe("GeminiManagedAgentsAdapter — interrupt", () => {
  test("interrupt rejects pending result", async () => {
    let resolveFetch: (v: Response) => void = () => {}
    const fn = (async () =>
      new Promise<Response>((r) => (resolveFetch = r))) as unknown as typeof fetch
    const adapter = new GeminiManagedAgentsAdapter({ apiKey: "k", fetcher: fn })
    const session = await adapter.start(spec())
    expect(session.status()).toBe("running")
    const pending = session.result()
    session.interrupt()
    expect(session.status()).toBe("interrupted")
    resolveFetch(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { role: "model", parts: [{ text: "late" }] }, finishReason: "STOP" },
          ],
          usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
        }),
      ),
    )
    await expect(pending).rejects.toBeInstanceOf(ManagedAgentInterruptedError)
  })
})
