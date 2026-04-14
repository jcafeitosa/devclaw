import { describe, expect, test } from "bun:test"
import { AnthropicManagedAgentsAdapter } from "../../../src/runtime/managed/anthropic.ts"
import {
  ManagedAgentInterruptedError,
  type ManagedAgentSpec,
} from "../../../src/runtime/managed/types.ts"

interface CapturedRequest {
  url: string
  init: RequestInit
  body: unknown
}

function fakeFetch(responses: unknown[]) {
  const calls: CapturedRequest[] = []
  let idx = 0
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url: String(url), init: init ?? {}, body })
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
    model: "claude-opus-4-6",
    messages: [{ role: "user", content: "hello" }],
    maxTokens: 1024,
    ...over,
  }
}

describe("AnthropicManagedAgentsAdapter — kind + start", () => {
  test("kind reports 'anthropic-managed'", () => {
    const a = new AnthropicManagedAgentsAdapter({ apiKey: "sk-test" })
    expect(a.kind).toBe("anthropic-managed")
  })

  test("start returns a session whose result resolves with final assistant text", async () => {
    const { fn } = fakeFetch([
      {
        id: "msg_1",
        type: "message",
        role: "assistant",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "hi back" }],
        usage: { input_tokens: 5, output_tokens: 2 },
      },
    ])
    const adapter = new AnthropicManagedAgentsAdapter({ apiKey: "sk-test", fetcher: fn })
    const session = await adapter.start(spec())
    const result = await session.result()
    expect(result.text).toBe("hi back")
    expect(result.stopReason).toBe("end_turn")
    expect(result.usage.input_tokens).toBe(5)
  })

  test("sends required Anthropic headers + payload shape", async () => {
    const { fn, calls } = fakeFetch([
      {
        id: "x",
        type: "message",
        role: "assistant",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ])
    const adapter = new AnthropicManagedAgentsAdapter({ apiKey: "sk-test", fetcher: fn })
    const s = await adapter.start(spec({ systemPrompt: "be terse" }))
    await s.result()
    const c = calls[0]!
    expect(c.url).toBe("https://api.anthropic.com/v1/messages")
    const headers = c.init.headers as Record<string, string>
    expect(headers["x-api-key"]).toBe("sk-test")
    expect(headers["anthropic-version"]).toBeTruthy()
    expect(headers["content-type"]).toBe("application/json")
    const body = c.body as { system?: string; messages: { role: string }[] }
    expect(body.system).toBe("be terse")
    expect(body.messages[0]!.role).toBe("user")
  })
})

describe("AnthropicManagedAgentsAdapter — tool use loop", () => {
  test("dispatches tool_use blocks to handler, posts tool_result, finishes when stop_reason='end_turn'", async () => {
    const { fn } = fakeFetch([
      {
        id: "msg_1",
        type: "message",
        role: "assistant",
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "looking up" },
          { type: "tool_use", id: "tu_1", name: "search", input: { q: "cats" } },
        ],
        usage: { input_tokens: 3, output_tokens: 2 },
      },
      {
        id: "msg_2",
        type: "message",
        role: "assistant",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "found 3 results" }],
        usage: { input_tokens: 4, output_tokens: 3 },
      },
    ])
    const calls: { name: string; input: unknown }[] = []
    const adapter = new AnthropicManagedAgentsAdapter({
      apiKey: "sk-test",
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

  test("aborts loop after maxIterations to prevent runaway", async () => {
    const responses: unknown[] = []
    for (let i = 0; i < 10; i++) {
      responses.push({
        id: `m${i}`,
        type: "message",
        role: "assistant",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: `t${i}`, name: "echo", input: {} }],
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    }
    const { fn } = fakeFetch(responses)
    const adapter = new AnthropicManagedAgentsAdapter({
      apiKey: "sk",
      fetcher: fn,
      toolHandler: async () => ({}),
      maxIterations: 3,
    })
    const session = await adapter.start(
      spec({ tools: [{ name: "echo", description: "", input_schema: { type: "object" } }] }),
    )
    await expect(session.result()).rejects.toThrow(/iteration/i)
  })
})

describe("AnthropicManagedAgentsAdapter — interrupt + status", () => {
  test("interrupt before result rejects with ManagedAgentInterruptedError", async () => {
    let resolveFetch: (v: Response) => void = () => {}
    const fn = (async () => {
      return new Promise<Response>((r) => {
        resolveFetch = r
      })
    }) as unknown as typeof fetch
    const adapter = new AnthropicManagedAgentsAdapter({ apiKey: "sk", fetcher: fn })
    const session = await adapter.start(spec())
    expect(session.status()).toBe("running")
    const pending = session.result()
    session.interrupt()
    expect(session.status()).toBe("interrupted")
    resolveFetch(
      new Response(
        JSON.stringify({
          id: "m",
          type: "message",
          role: "assistant",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "late" }],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      ),
    )
    await expect(pending).rejects.toBeInstanceOf(ManagedAgentInterruptedError)
  })

  test("status transitions to 'completed' after success", async () => {
    const { fn } = fakeFetch([
      {
        id: "m",
        type: "message",
        role: "assistant",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "done" }],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    ])
    const adapter = new AnthropicManagedAgentsAdapter({ apiKey: "sk", fetcher: fn })
    const session = await adapter.start(spec())
    await session.result()
    expect(session.status()).toBe("completed")
  })
})
