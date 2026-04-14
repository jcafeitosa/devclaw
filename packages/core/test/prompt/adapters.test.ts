import { describe, expect, test } from "bun:test"
import { toAnthropicMessages } from "../../src/prompt/adapters/anthropic.ts"
import { toOpenAIMessages } from "../../src/prompt/adapters/openai.ts"
import type { RenderedPrompt } from "../../src/prompt/types.ts"

const base: RenderedPrompt = {
  templateId: "t",
  templateVersion: "1",
  system: "You are helpful.",
  messages: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "again" },
  ],
  cacheKey: "k",
}

describe("toAnthropicMessages", () => {
  test("separates system from messages", () => {
    const out = toAnthropicMessages(base)
    expect(out.system).toBe("You are helpful.")
    expect(out.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "again" },
    ])
  })

  test("omits system when absent", () => {
    const out = toAnthropicMessages({ ...base, system: undefined })
    expect(out.system).toBeUndefined()
  })

  test("passes cacheKey through as prompt_key metadata", () => {
    const out = toAnthropicMessages(base)
    expect(out.cacheKey).toBe("k")
  })
})

describe("toOpenAIMessages", () => {
  test("prepends system when present", () => {
    const out = toOpenAIMessages(base)
    expect(out.messages[0]).toEqual({ role: "system", content: "You are helpful." })
    expect(out.messages.slice(1)).toEqual(base.messages)
  })

  test("skips system when absent", () => {
    const out = toOpenAIMessages({ ...base, system: undefined })
    expect(out.messages).toEqual(base.messages)
  })

  test("exposes cacheKey", () => {
    expect(toOpenAIMessages(base).cacheKey).toBe("k")
  })
})
