import type { PromptMessage, RenderedPrompt } from "../types.ts"

export interface OpenAIPromptShape {
  messages: PromptMessage[]
  cacheKey: string
}

export function toOpenAIMessages(prompt: RenderedPrompt): OpenAIPromptShape {
  const messages: PromptMessage[] = []
  if (prompt.system) messages.push({ role: "system", content: prompt.system })
  messages.push(...prompt.messages)
  return { messages, cacheKey: prompt.cacheKey }
}
