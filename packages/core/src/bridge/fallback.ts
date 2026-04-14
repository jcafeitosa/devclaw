import type { SafetyKernel } from "../kernel/index.ts"
import type { BudgetEnforcer } from "../cost/budget.ts"
import type { ProviderCatalog } from "../provider/catalog.ts"
import { createDefaultModerator } from "../safety/moderator.ts"
import type { Moderator } from "../safety/types.ts"
import type { BridgeRegistry } from "./registry.ts"
import type { Bridge, BridgeEvent, BridgeRequest } from "./types.ts"

export interface FallbackStrategyConfig {
  registry: BridgeRegistry
  catalog: ProviderCatalog
  fallbackProviderId?: string
  fallbackModel?: string
  moderator?: Moderator
  kernel?: SafetyKernel
  budget?: BudgetEnforcer
}

export class FallbackStrategy {
  constructor(private readonly cfg: FallbackStrategyConfig) {}

  execute(req: BridgeRequest): AsyncIterable<BridgeEvent> {
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        if (self.cfg.kernel) {
          const bridge = await self.pickBridge(req)
          if (bridge) {
            self.chargeBudget(req, bridge.estimateCost(req).costUsd)
            for await (const event of self.cfg.kernel.invoke(
              {
                actor: req.agentId,
                taskId: req.taskId,
              },
              {
                kind: "bridge",
                tool: bridge.cli,
                action: "bridge.execute",
                inputText: req.prompt,
                input: { cli: req.cli, cwd: req.cwd, model: req.model },
                target: req.cwd,
                execute: () => bridge.execute(req) as AsyncIterable<import("../kernel/index.ts").KernelEvent>,
              },
            )) {
              yield event as BridgeEvent
            }
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
            const text = await self.cfg.catalog.generate(
              self.cfg.fallbackProviderId,
              {
                prompt: req.prompt,
                model: self.cfg.fallbackModel ?? req.model,
                maxTokens: req.constraints?.maxTokens,
              },
              { actor: req.agentId, taskId: req.taskId },
            )
            yield { type: "text", content: text }
            yield { type: "completed" }
          } catch (err) {
            yield {
              type: "error",
              message: err instanceof Error ? err.message : String(err),
              recoverable: false,
            }
          }
          return
        }
        const moderator = self.cfg.moderator ?? createDefaultModerator()
        const moderation = await moderator.check(req.prompt, "input")
        if (moderation.flags.length > 0) {
          yield {
            type: "log",
            level: "error",
            message: `safety blocked input for ${req.cli}: ${moderation.flags.map((flag) => flag.category).join(", ")}`,
          }
          yield {
            type: "error",
            message: `safety blocked input: ${moderation.flags.map((flag) => flag.category).join(", ")}`,
            recoverable: false,
          }
          return
        }

        const bridge = await self.pickBridge(req)
        if (bridge) {
          self.chargeBudget(req, bridge.estimateCost(req).costUsd)
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

  private chargeBudget(req: BridgeRequest, plannedUsd: number): void {
    if (!this.cfg.budget) return
    this.cfg.budget.check({ taskId: req.taskId, sessionId: req.sessionId }, plannedUsd)
    if (plannedUsd > 0) {
      this.cfg.budget.record({
        taskId: req.taskId,
        sessionId: req.sessionId,
        usd: plannedUsd,
        at: Date.now(),
      })
    }
  }
}
