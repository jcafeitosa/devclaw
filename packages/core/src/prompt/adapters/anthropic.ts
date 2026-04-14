import type { RenderedPrompt } from "../types.ts"

export interface AnthropicPromptShape {
  system?: string
  messages: Array<{ role: "user" | "assistant"; content: string }>
  cacheKey: string
}

export function toAnthropicMessages(prompt: RenderedPrompt): AnthropicPromptShape {
  const messages = prompt.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
  return { system: prompt.system, messages, cacheKey: prompt.cacheKey }
}
