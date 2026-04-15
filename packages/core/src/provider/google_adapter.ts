import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import { generateWithSdk } from "./ai_sdk.ts"
import type { ProviderDescriptor } from "./catalog.ts"
import type { ProviderFetch } from "./fetch.ts"

export interface GoogleConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  fetch?: ProviderFetch
}

export function makeGoogleAdapter(cfg: GoogleConfig): ProviderDescriptor {
  const baseUrl = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"
  const defaultModel = cfg.defaultModel ?? "gemini-2.5-flash"
  const provider =
    cfg.baseUrl || cfg.apiKey || cfg.fetch
      ? createGoogleGenerativeAI({
          apiKey: cfg.apiKey,
          baseURL: baseUrl,
          fetch: cfg.fetch as typeof globalThis.fetch | undefined,
        })
      : google

  return {
    id: "google",
    name: "Google AI",
    baseUrl,
    defaultModel,
    async generate(opts) {
      return generateWithSdk(provider(opts.model ?? defaultModel), opts)
    },
  }
}
