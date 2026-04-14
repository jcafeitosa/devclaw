import { makeSpawnBridge, type SpawnBridgeConfig } from "./spawn_bridge.ts"
import type { Bridge } from "./types.ts"

export type AiderBridgeConfig = Partial<
  Omit<SpawnBridgeConfig, "cli" | "binary" | "args" | "parser" | "capabilities">
>

export function makeAiderBridge(cfg: AiderBridgeConfig = {}): Bridge {
  return makeSpawnBridge({
    cli: "aider",
    binary: "aider",
    parser: "text",
    args: (req) => [
      "--yes",
      "--no-auto-commits",
      "--message",
      req.prompt,
      ...(req.workspace?.filesRelevant ?? []),
    ],
    capabilities: {
      modes: ["agentic"],
      contextWindow: 128_000,
      supportsTools: false,
      supportsSubagents: false,
      supportsStreaming: true,
      supportsMultimodal: false,
      supportsWebSearch: false,
      supportsMcp: false,
      preferredFor: ["refactor", "legacy", "git-aware"],
    },
    ...cfg,
  })
}
