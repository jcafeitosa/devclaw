import { makeSpawnBridge, type SpawnBridgeConfig } from "./spawn_bridge.ts"
import type { Bridge } from "./types.ts"

export type GeminiBridgeConfig = Partial<
  Omit<SpawnBridgeConfig, "cli" | "binary" | "args" | "parser" | "capabilities">
>

export function makeGeminiBridge(cfg: GeminiBridgeConfig = {}): Bridge {
  return makeSpawnBridge({
    cli: "gemini",
    binary: "gemini",
    parser: "text",
    args: () => [],
    capabilities: {
      modes: ["oneshot", "agentic"],
      contextWindow: 1_000_000,
      supportsTools: true,
      supportsSubagents: false,
      supportsStreaming: true,
      supportsMultimodal: true,
      supportsWebSearch: true,
      supportsMcp: false,
      preferredFor: ["research", "multimodal", "long-context"],
    },
    ...cfg,
  })
}
