import { homedir } from "node:os"
import { join } from "node:path"
import { type AuthStore, FilesystemAuthStore } from "@devclaw/core/auth"
import {
  BridgeRegistry,
  ClaudeCodeBridge,
  FallbackStrategy,
  makeAiderBridge,
  makeCodexBridge,
  makeGeminiBridge,
} from "@devclaw/core/bridge"
import { type BudgetEnforcer, makeDefaultBudgetEnforcer } from "@devclaw/core/cost"
import {
  makeAnthropicAdapter,
  makeOpenAIAdapter,
  ProviderCatalog,
  registerBuiltins,
} from "@devclaw/core/provider"

export interface RuntimeConfig {
  home?: string
  passphrase?: string
  rootDir?: string
}

export interface Runtime {
  authStore: AuthStore
  catalog: ProviderCatalog
  bridges: BridgeRegistry
  fallback: FallbackStrategy
  budget?: BudgetEnforcer
  rootDir: string
  home: string
}

function resolvePassphrase(override?: string): string {
  if (override) return override
  return process.env.DEVCLAW_PASSPHRASE ?? "devclaw-dev"
}

export async function createRuntime(cfg: RuntimeConfig = {}): Promise<Runtime> {
  const home = cfg.home ?? join(homedir(), ".devclaw")
  const rootDir = cfg.rootDir ?? process.cwd()
  const authStore = new FilesystemAuthStore({
    dir: home,
    passphrase: resolvePassphrase(cfg.passphrase),
  })
  const catalog = new ProviderCatalog()
  await registerBuiltins({ catalog, store: authStore })
  const bridges = new BridgeRegistry()
  bridges.register(new ClaudeCodeBridge())
  bridges.register(makeCodexBridge({ authStore }))
  bridges.register(makeGeminiBridge())
  bridges.register(makeAiderBridge())
  const budget = makeDefaultBudgetEnforcer()
  const firstProvider = catalog.list()[0]
  const fallback = new FallbackStrategy({
    registry: bridges,
    catalog,
    fallbackProviderId: firstProvider?.id,
    budget,
  })
  return { authStore, catalog, bridges, fallback, budget, rootDir, home }
}

export function mockAnthropicRegistered(store: AuthStore, catalog: ProviderCatalog): void {
  // helper for tests: register anthropic adapter without API call (see runtime.test.ts)
  void store
  catalog.register(makeAnthropicAdapter({ apiKey: "test" }))
}

export function mockOpenAIRegistered(catalog: ProviderCatalog): void {
  catalog.register(makeOpenAIAdapter({ apiKey: "test" }))
}
