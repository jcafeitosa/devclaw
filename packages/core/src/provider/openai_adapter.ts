import { type ProviderDescriptor, ProviderError } from "./catalog.ts"

export interface OpenAIConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  organization?: string
}

interface ChatCompletionResponse {
  id: string
  choices: Array<{
    message: { role: string; content: string | null }
    finish_reason?: string
  }>
}

export function makeOpenAIAdapter(cfg: OpenAIConfig): ProviderDescriptor {
  const baseUrl = cfg.baseUrl ?? "https://api.openai.com"
  const defaultModel = cfg.defaultModel ?? "gpt-4o-mini"

  return {
    id: "openai",
    name: "OpenAI",
    baseUrl,
    defaultModel,
    async generate(opts) {
      const messages: Array<{ role: string; content: string }> = []
      if (opts.system) messages.push({ role: "system", content: opts.system })
      messages.push({ role: "user", content: opts.prompt })

      const body: Record<string, unknown> = {
        model: opts.model ?? defaultModel,
        messages,
      }
      if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens
      if (opts.temperature !== undefined) body.temperature = opts.temperature

      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      }
      if (cfg.organization) headers["openai-organization"] = cfg.organization

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) throw new ProviderError("openai", res.status, text)
      const parsed = JSON.parse(text) as ChatCompletionResponse
      return parsed.choices[0]?.message.content ?? ""
    },
  }
}
