import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateWithSdk } from "./ai_sdk.ts"
import type { ProviderDescriptor } from "./catalog.ts"
import type { ProviderFetch } from "./fetch.ts"

export interface OpenRouterConfig {
  apiKey?: string
  baseUrl?: string
  defaultModel?: string
  fetch?: ProviderFetch
}

export function makeOpenRouterAdapter(cfg: OpenRouterConfig = {}): ProviderDescriptor {
  const baseUrl = cfg.baseUrl ?? "https://openrouter.ai/api/v1"
  const defaultModel = cfg.defaultModel ?? "openai/gpt-4o-mini"
  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: baseUrl,
    apiKey: cfg.apiKey,
    fetch: cfg.fetch as typeof globalThis.fetch | undefined,
  })

  return {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl,
    defaultModel,
    async generate(opts) {
      return generateWithSdk(provider.chatModel(opts.model ?? defaultModel), opts)
    },
  }
}
