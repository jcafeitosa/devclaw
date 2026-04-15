import {
  type GenerateOpts,
  type GenerateResult,
  type ProviderDescriptor,
  ProviderError,
  type UsageMetrics,
} from "./catalog.ts"

export interface AnthropicConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  anthropicVersion?: string
  fetch?: typeof fetch | ((input: string | URL | Request, init?: RequestInit | BunFetchRequestInit) => Promise<Response>)
}

interface ContentBlock {
  type: string
  text?: string
}

interface MessagesResponse {
  id: string
  model?: string
  content: ContentBlock[]
  stop_reason?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

export function makeAnthropicAdapter(cfg: AnthropicConfig): ProviderDescriptor {
  const baseUrl = cfg.baseUrl ?? "https://api.anthropic.com"
  const defaultModel = cfg.defaultModel ?? "claude-opus-4-5-20250929"
  const version = cfg.anthropicVersion ?? "2023-06-01"
  const fetcher = cfg.fetch ?? fetch

  async function generateWithUsage(opts: GenerateOpts): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: opts.model ?? defaultModel,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [{ role: "user", content: opts.prompt }],
    }
    if (opts.system) {
      body.system = opts.cacheSystem
        ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
        : opts.system
    }
    if (opts.temperature !== undefined) body.temperature = opts.temperature

    const res = await fetcher(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": version,
      },
      body: JSON.stringify(body),
    })
    const raw = await res.text()
    if (!res.ok) throw new ProviderError("anthropic", res.status, raw)
    const parsed = JSON.parse(raw) as MessagesResponse
    const text = parsed.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text ?? "")
      .join("")
    const usage: UsageMetrics = {
      input_tokens: parsed.usage?.input_tokens ?? 0,
      output_tokens: parsed.usage?.output_tokens ?? 0,
    }
    if (parsed.usage?.cache_read_input_tokens !== undefined) {
      usage.cache_read_input_tokens = parsed.usage.cache_read_input_tokens
    }
    if (parsed.usage?.cache_creation_input_tokens !== undefined) {
      usage.cache_creation_input_tokens = parsed.usage.cache_creation_input_tokens
    }
    return { text, model: parsed.model ?? opts.model ?? defaultModel, usage }
  }

  return {
    id: "anthropic",
    name: "Anthropic",
    baseUrl,
    defaultModel,
    async generate(opts) {
      return (await generateWithUsage(opts)).text
    },
    generateWithUsage,
  }
}
