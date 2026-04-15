import type { Moderator } from "../safety/types.ts"
import { parseJsonlEvents, parseTextEvents } from "./event_stream.ts"
import type { InjectableProcessRunner, ProcessHandle } from "./process_runner.ts"
import { ProcessRunner } from "./process_runner.ts"
import type {
  AuthStatus,
  Bridge,
  BridgeEvent,
  BridgeRequest,
  Capabilities,
  CostEstimate,
} from "./types.ts"

export interface SpawnBridgeConfig {
  cli: string
  binary: string
  args: (req: BridgeRequest) => string[]
  capabilities: Capabilities
  parser: "jsonl" | "text"
  runner?: InjectableProcessRunner
  which?: (binary: string) => Promise<string | null>
  isAuthenticated?: () => Promise<AuthStatus>
  estimateCost?: (req: BridgeRequest) => CostEstimate
  env?: (req: BridgeRequest) => Record<string, string> | undefined
  timeoutMs?: number
  /** Safety kernel — when present, scans prompt (input) + text events (output). Non-bypassable per ADR-022. */
  moderator?: Moderator
}

async function defaultWhich(name: string): Promise<string | null> {
  return Bun.which(name) ?? null
}

function defaultEstimate(_req: BridgeRequest): CostEstimate {
  return { costUsd: 0, tokensIn: 0, tokensOut: 0, subscriptionCovered: true }
}

export class SpawnBridge implements Bridge {
  readonly cli: string
  private readonly cfg: SpawnBridgeConfig
  private readonly runner: InjectableProcessRunner
  private readonly whichFn: (name: string) => Promise<string | null>
  private readonly inflight = new Map<string, ProcessHandle>()

  constructor(cfg: SpawnBridgeConfig) {
    this.cfg = cfg
    this.cli = cfg.cli
    this.runner = cfg.runner ?? new ProcessRunner()
    this.whichFn = cfg.which ?? defaultWhich
  }

  async isAvailable(): Promise<boolean> {
    return (await this.whichFn(this.cfg.binary)) !== null
  }

  async isAuthenticated(): Promise<AuthStatus> {
    if (this.cfg.isAuthenticated) return this.cfg.isAuthenticated()
    return { authed: await this.isAvailable() }
  }

  capabilities(): Capabilities {
    return this.cfg.capabilities
  }

  estimateCost(req: BridgeRequest): CostEstimate {
    return (this.cfg.estimateCost ?? defaultEstimate)(req)
  }

  execute(req: BridgeRequest): AsyncIterable<BridgeEvent> {
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        if (self.cfg.moderator) {
          const r = await self.cfg.moderator.check(req.prompt, "input")
          if (!r.allowed) {
            yield {
              type: "error",
              message: `safety: input blocked (${r.flags.map((f) => f.category).join(",")})`,
              recoverable: false,
            }
            return
          }
        }
        const handle = self.runner.spawn([self.cfg.binary, ...self.cfg.args(req)], {
          cwd: req.cwd,
          stdin: req.prompt,
          env: self.cfg.env?.(req),
          timeoutMs: req.constraints?.maxDurationMs ?? self.cfg.timeoutMs,
        })
        self.inflight.set(req.taskId, handle)
        yield { type: "started", at: Date.now() } as BridgeEvent
        const stderrLines: string[] = []
        const stderrPromise = (async () => {
          for await (const line of handle.stderr) stderrLines.push(line)
        })()
        try {
          const source =
            self.cfg.parser === "jsonl"
              ? parseJsonlEvents(handle.stdout, self.cli)
              : parseTextEvents(handle.stdout)
          for await (const event of source) {
            if (self.cfg.moderator && event.type === "text") {
              const r = await self.cfg.moderator.check(event.content, "output")
              if (!r.allowed) {
                yield {
                  type: "error",
                  message: `safety: output blocked (${r.flags.map((f) => f.category).join(",")})`,
                  recoverable: false,
                }
                handle.kill()
                return
              }
            }
            yield event
          }
          const exit = await handle.exited
          await stderrPromise
          if (handle.timedOut) {
            yield { type: "error", message: `bridge ${self.cli}: timed out`, recoverable: false }
          } else if (exit !== 0) {
            yield {
              type: "error",
              message: `bridge ${self.cli}: exit ${exit}${
                stderrLines.length > 0 ? `: ${stderrLines.join(" ")}` : ""
              }`,
              recoverable: false,
            }
          } else {
            yield { type: "completed" }
          }
        } finally {
          self.inflight.delete(req.taskId)
        }
      },
    }
  }

  async cancel(taskId: string): Promise<void> {
    const handle = this.inflight.get(taskId)
    if (handle) {
      handle.kill()
      this.inflight.delete(taskId)
    }
  }
}

export function makeSpawnBridge(cfg: SpawnBridgeConfig): Bridge {
  return new SpawnBridge(cfg)
}
