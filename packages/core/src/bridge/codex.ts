import type { AuthStore } from "../auth/store.ts"
import { isOAuthAuth } from "../auth/types.ts"
import { makeSpawnBridge, type SpawnBridgeConfig } from "./spawn_bridge.ts"
import type { Bridge } from "./types.ts"

export interface CodexBridgeConfig
  extends Partial<Omit<SpawnBridgeConfig, "cli" | "binary" | "args" | "parser" | "capabilities">> {
  authStore?: AuthStore
  provider?: string
  accountId?: string
}

export function makeCodexBridge(cfg: CodexBridgeConfig = {}): Bridge {
  const isAuthenticated = cfg.isAuthenticated
    ? cfg.isAuthenticated
    : cfg.authStore
      ? async () => {
          const auth = await cfg.authStore!.load(cfg.provider ?? "codex", cfg.accountId)
          return { authed: auth != null && isOAuthAuth(auth) }
        }
      : undefined
  return makeSpawnBridge({
    cli: "codex",
    binary: "codex",
    parser: "jsonl",
    args: () => ["exec", "--json"],
    capabilities: {
      modes: ["agentic", "oneshot"],
      contextWindow: 200_000,
      supportsTools: true,
      supportsSubagents: true,
      supportsStreaming: true,
      supportsMultimodal: false,
      supportsWebSearch: false,
      supportsMcp: false,
      preferredFor: ["code", "reasoning"],
    },
    ...(isAuthenticated ? { isAuthenticated } : {}),
    ...cfg,
  })
}
