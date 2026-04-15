import {
  type GenerateOpts,
  type GenerateResult,
  type ProviderDescriptor,
  ProviderError,
  type UsageMetrics,
} from "./catalog.ts"

export interface OpenAIConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  organization?: string
  fetch?: typeof fetch | ((input: string | URL | Request, init?: RequestInit | BunFetchRequestInit) => Promise<Response>)
}

interface ChatCompletionResponse {
  id: string
  model?: string
  choices: Array<{
    message: { role: string; content: string | null }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

export function makeOpenAIAdapter(cfg: OpenAIConfig): ProviderDescriptor {
  const baseUrl = cfg.baseUrl ?? "https://api.openai.com"
  const defaultModel = cfg.defaultModel ?? "gpt-4o-mini"
  const fetcher = cfg.fetch ?? fetch

  async function generateWithUsage(opts: GenerateOpts): Promise<GenerateResult> {
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

    const res = await fetcher(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    const raw = await res.text()
    if (!res.ok) throw new ProviderError("openai", res.status, raw)
    const parsed = JSON.parse(raw) as ChatCompletionResponse
    const text = parsed.choices[0]?.message.content ?? ""
    const usage: UsageMetrics = {
      input_tokens: parsed.usage?.prompt_tokens ?? 0,
      output_tokens: parsed.usage?.completion_tokens ?? 0,
    }
    const cached = parsed.usage?.prompt_tokens_details?.cached_tokens
    if (cached !== undefined) usage.prompt_cache_tokens = cached
    return { text, model: parsed.model ?? opts.model ?? defaultModel, usage }
  }

  return {
    id: "openai",
    name: "OpenAI",
    baseUrl,
    defaultModel,
    async generate(opts) {
      return (await generateWithUsage(opts)).text
    },
    generateWithUsage,
  }
}
