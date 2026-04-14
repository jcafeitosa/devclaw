export * from "./anthropic_adapter.ts"
export * from "./catalog.ts"
export * from "./openai_adapter.ts"

import type { AuthStore } from "../auth/store.ts"
import { isApiAuth } from "../auth/types.ts"
import { makeAnthropicAdapter } from "./anthropic_adapter.ts"
import { ProviderCatalog } from "./catalog.ts"
import { makeOpenAIAdapter } from "./openai_adapter.ts"

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

  return catalog
}
