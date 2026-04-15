import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateWithSdk } from "./ai_sdk.ts"
import type { ProviderDescriptor } from "./catalog.ts"
import type { ProviderFetch } from "./fetch.ts"

export interface OllamaConfig {
  apiKey?: string
  baseUrl?: string
  defaultModel?: string
  fetch?: ProviderFetch
}

export function makeOllamaAdapter(cfg: OllamaConfig = {}): ProviderDescriptor {
  const baseUrl = cfg.baseUrl ?? "http://127.0.0.1:11434/v1"
  const defaultModel = cfg.defaultModel ?? "llama3.2"
  const provider = createOpenAICompatible({
    name: "ollama",
    baseURL: baseUrl,
    apiKey: cfg.apiKey,
    fetch: cfg.fetch as typeof globalThis.fetch | undefined,
  })

  return {
    id: "ollama",
    name: "Ollama",
    baseUrl,
    defaultModel,
    async generate(opts) {
      return generateWithSdk(provider.chatModel(opts.model ?? defaultModel), opts)
    },
  }
}
