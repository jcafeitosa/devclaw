import { describe, expect, test } from "bun:test"
import { OpenAIAssistantsAdapter } from "../../../src/runtime/managed/openai.ts"
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
    model: "gpt-5",
    messages: [{ role: "user", content: "hello" }],
    maxTokens: 1024,
    ...over,
  }
}

describe("OpenAIAssistantsAdapter — kind + start", () => {
  test("kind reports 'openai-assistants'", () => {
    const a = new OpenAIAssistantsAdapter({ apiKey: "sk-x" })
    expect(a.kind).toBe("openai-assistants")
  })

  test("start returns final assistant message", async () => {
    const { fn, calls } = fakeFetch([
      {
        id: "chatcmpl-1",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "hi back" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      },
    ])
    const adapter = new OpenAIAssistantsAdapter({ apiKey: "sk-x", fetcher: fn })
    const session = await adapter.start(spec({ systemPrompt: "be terse" }))
    const result = await session.result()
    expect(result.text).toBe("hi back")
    expect(result.stopReason).toBe("stop")
    expect(result.usage.input_tokens).toBe(5)
    expect(result.usage.output_tokens).toBe(2)
    const c = calls[0]!
    expect(c.url).toBe("https://api.openai.com/v1/chat/completions")
    expect(c.headers.authorization).toBe("Bearer sk-x")
    const body = c.body as { messages: { role: string }[] }
    expect(body.messages[0]!.role).toBe("system")
    expect(body.messages[1]!.role).toBe("user")
  })
})

describe("OpenAIAssistantsAdapter — tool use loop", () => {
  test("dispatches tool_calls and posts tool messages back", async () => {
    const { fn } = fakeFetch([
      {
        id: "1",
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search", arguments: JSON.stringify({ q: "cats" }) },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      },
      {
        id: "2",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "found 3 results" },
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 3 },
      },
    ])
    const calls: { name: string; input: unknown }[] = []
    const adapter = new OpenAIAssistantsAdapter({
      apiKey: "sk-x",
      fetcher: fn,
      toolHandler: async (name, input) => {
        calls.push({ name, input })
        return { hits: 3 }
      },
    })
    const session = await adapter.start(
      spec({
        tools: [{ name: "search", description: "s", input_schema: { type: "object" } }],
      }),
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
        id: `r${i}`,
        choices: [
          {
            index: 0,
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: `c${i}`, type: "function", function: { name: "echo", arguments: "{}" } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
    }
    const { fn } = fakeFetch(responses)
    const adapter = new OpenAIAssistantsAdapter({
      apiKey: "sk-x",
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

describe("OpenAIAssistantsAdapter — interrupt", () => {
  test("interrupt rejects pending result", async () => {
    let resolveFetch: (v: Response) => void = () => {}
    const fn = (async () =>
      new Promise<Response>((r) => (resolveFetch = r))) as unknown as typeof fetch
    const adapter = new OpenAIAssistantsAdapter({ apiKey: "sk-x", fetcher: fn })
    const session = await adapter.start(spec())
    expect(session.status()).toBe("running")
    const pending = session.result()
    session.interrupt()
    expect(session.status()).toBe("interrupted")
    resolveFetch(
      new Response(
        JSON.stringify({
          id: "x",
          choices: [
            { index: 0, finish_reason: "stop", message: { role: "assistant", content: "late" } },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0 },
        }),
      ),
    )
    await expect(pending).rejects.toBeInstanceOf(ManagedAgentInterruptedError)
  })
})
