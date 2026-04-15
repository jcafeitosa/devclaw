export * from "./anthropic_adapter.ts"
export * from "./catalog.ts"
export * from "./google_adapter.ts"
export * from "./ollama_adapter.ts"
export * from "./openai_adapter.ts"
export * from "./openrouter_adapter.ts"

import type { AuthStore } from "../auth/store.ts"
import { isApiAuth } from "../auth/types.ts"
import { makeAnthropicAdapter } from "./anthropic_adapter.ts"
import { ProviderCatalog } from "./catalog.ts"
import { makeGoogleAdapter } from "./google_adapter.ts"
import { makeOllamaAdapter } from "./ollama_adapter.ts"
import { makeOpenAIAdapter } from "./openai_adapter.ts"
import { makeOpenRouterAdapter } from "./openrouter_adapter.ts"

export interface RegisterBuiltinsOpts {
  catalog?: ProviderCatalog
  store: AuthStore
}

export async function registerBuiltins(opts: RegisterBuiltinsOpts): Promise<ProviderCatalog> {
  const catalog = opts.catalog ?? new ProviderCatalog()

  const anthropic = await opts.store.load("anthropic")
  if (anthropic && isApiAuth(anthropic)) {
    catalog.register(makeAnthropicAdapter({ apiKey: anthropic.key }))
  }

  const openai = await opts.store.load("openai")
  if (openai && isApiAuth(openai)) {
    catalog.register(makeOpenAIAdapter({ apiKey: openai.key }))
  }

  const google = (await opts.store.load("google")) ?? (await opts.store.load("gemini"))
  if (google && isApiAuth(google)) {
    catalog.register(makeGoogleAdapter({ apiKey: google.key }))
  }

  const openrouter = (await opts.store.load("openrouter")) ?? (await opts.store.load("router"))
  if (openrouter && isApiAuth(openrouter)) {
    catalog.register(
      makeOpenRouterAdapter({
        apiKey: openrouter.key,
        baseUrl: openrouter.meta?.baseUrl ?? process.env.OPENROUTER_BASE_URL,
        defaultModel: openrouter.meta?.model ?? process.env.OPENROUTER_MODEL,
      }),
    )
  } else if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_BASE_URL) {
    catalog.register(
      makeOpenRouterAdapter({
        baseUrl: process.env.OPENROUTER_BASE_URL,
        apiKey: process.env.OPENROUTER_API_KEY,
        defaultModel: process.env.OPENROUTER_MODEL,
      }),
    )
  }

  const ollama = await opts.store.load("ollama")
  if (ollama && isApiAuth(ollama)) {
    catalog.register(
      makeOllamaAdapter({
        apiKey: ollama.key,
        baseUrl: ollama.meta?.baseUrl ?? process.env.OLLAMA_BASE_URL,
      }),
    )
    return catalog
  }

  catalog.register(
    makeOllamaAdapter({
      baseUrl: process.env.OLLAMA_BASE_URL,
      apiKey: process.env.OLLAMA_API_KEY,
    }),
  )

  return catalog
}
