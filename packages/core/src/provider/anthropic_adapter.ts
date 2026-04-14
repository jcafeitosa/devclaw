import { type ProviderDescriptor, ProviderError } from "./catalog.ts"

export interface AnthropicConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  anthropicVersion?: string
}

interface ContentBlock {
  type: string
  text?: string
}

interface MessagesResponse {
  id: string
  content: ContentBlock[]
  stop_reason?: string
}

export function makeAnthropicAdapter(cfg: AnthropicConfig): ProviderDescriptor {
  const baseUrl = cfg.baseUrl ?? "https://api.anthropic.com"
  const defaultModel = cfg.defaultModel ?? "claude-opus-4-5-20250929"
  const version = cfg.anthropicVersion ?? "2023-06-01"

  return {
    id: "anthropic",
    name: "Anthropic",
    baseUrl,
    defaultModel,
    async generate(opts) {
      const body: Record<string, unknown> = {
        model: opts.model ?? defaultModel,
        max_tokens: opts.maxTokens ?? 4096,
        messages: [{ role: "user", content: opts.prompt }],
      }
      if (opts.system) body.system = opts.system
      if (opts.temperature !== undefined) body.temperature = opts.temperature

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": version,
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) throw new ProviderError("anthropic", res.status, text)
      const parsed = JSON.parse(text) as MessagesResponse
      return parsed.content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text ?? "")
        .join("")
    },
  }
}
