export interface Template {
  id: string
  version: string
  system?: string
  user: string
  description?: string
}

export type RenderContext = Record<string, unknown>

export type PromptRole = "system" | "user" | "assistant"

export interface PromptMessage {
  role: PromptRole
  content: string
}

export interface RenderedPrompt {
  templateId: string
  templateVersion: string
  system?: string
  messages: PromptMessage[]
  cacheKey: string
}
