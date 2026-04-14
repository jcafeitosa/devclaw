import type { ProviderCatalog } from "../provider/catalog.ts"
import type { BridgeRegistry } from "./registry.ts"
import type { Bridge, BridgeEvent, BridgeRequest } from "./types.ts"

export interface FallbackStrategyConfig {
  registry: BridgeRegistry
  catalog: ProviderCatalog
  fallbackProviderId?: string
  fallbackModel?: string
}

export class FallbackStrategy {
  constructor(private readonly cfg: FallbackStrategyConfig) {}

  execute(req: BridgeRequest): AsyncIterable<BridgeEvent> {
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        const bridge = await self.pickBridge(req)
        if (bridge) {
          for await (const event of bridge.execute(req)) yield event
          return
        }
        if (!self.cfg.fallbackProviderId) {
          throw new Error(
            `bridge: no bridge available for '${req.cli}' and no fallback provider configured`,
          )
        }
        yield {
          type: "log",
          level: "info",
          message: `bridge ${req.cli} unavailable — fallback to provider '${self.cfg.fallbackProviderId}'`,
        }
        yield { type: "started", at: Date.now() }
        try {
          const text = await self.cfg.catalog.generate(self.cfg.fallbackProviderId, {
            prompt: req.prompt,
            model: self.cfg.fallbackModel ?? req.model,
            maxTokens: req.constraints?.maxTokens,
          })
          yield { type: "text", content: text }
          yield { type: "completed" }
        } catch (err) {
          yield {
            type: "error",
            message: err instanceof Error ? err.message : String(err),
            recoverable: false,
          }
        }
      },
    }
  }

  private async pickBridge(req: BridgeRequest): Promise<Bridge | null> {
    const preferred = await this.cfg.registry.select(req)
    if (preferred) return preferred
    return this.cfg.registry.selectByCapability(req, () => true)
  }
}
