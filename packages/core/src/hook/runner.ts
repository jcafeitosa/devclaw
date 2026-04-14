import { HookBlockedError } from "./errors.ts"
import type { HookRegistry } from "./registry.ts"
import type { HookContext, HookResult, HookType } from "./types.ts"

export interface HookRunnerConfig {
  registry: HookRegistry
  maxRetries?: number
}

export interface ChainResult<P> {
  action: "pass" | "blocked"
  payload: P
  suppressed: boolean
  retriedBy?: string
  blockedBy?: string
  reason?: string
}

export class HookRunner {
  constructor(private readonly cfg: HookRunnerConfig) {}

  async run<P>(type: HookType, payload: P, meta?: Record<string, string>): Promise<ChainResult<P>> {
    const hooks = this.cfg.registry.forType(type)
    let current = payload
    let suppressed = false
    const maxRetries = this.cfg.maxRetries ?? 3
    for (const hook of hooks) {
      let retries = 0
      while (true) {
        const ctx: HookContext<P> = { type, payload: current, meta }
        const raw = hook.handler(ctx as HookContext<unknown>)
        const result = (raw instanceof Promise ? await raw : raw) as HookResult<P>
        if (result.action === "pass") break
        if (result.action === "modify") {
          if (result.payload !== undefined) current = result.payload
          break
        }
        if (result.action === "suppress") {
          suppressed = true
          break
        }
        if (result.action === "block") {
          return {
            action: "blocked",
            payload: current,
            suppressed,
            blockedBy: hook.name,
            reason: result.reason ?? "blocked",
          }
        }
        if (result.action === "retry") {
          retries++
          if (retries > maxRetries) {
            return {
              action: "blocked",
              payload: current,
              suppressed,
              blockedBy: hook.name,
              reason: `retry limit exceeded (${maxRetries})`,
            }
          }
          if (result.retryAfterMs && result.retryAfterMs > 0) {
            await Bun.sleep(result.retryAfterMs)
          }
        }
      }
    }
    return { action: "pass", payload: current, suppressed }
  }

  async runOrThrow<P>(type: HookType, payload: P, meta?: Record<string, string>): Promise<P> {
    const result = await this.run(type, payload, meta)
    if (result.action === "blocked") {
      throw new HookBlockedError(result.blockedBy ?? type, result.reason ?? "blocked")
    }
    return result.payload
  }
}
