import type { Moderator } from "../safety/types.ts"
import { parseJsonlEvents } from "./event_stream.ts"
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

export interface ClaudeCodeBridgeConfig {
  runner?: InjectableProcessRunner
  which?: (binary: string) => Promise<string | null>
  binary?: string
  extraArgs?: string[]
  timeoutMs?: number
  /** Safety kernel — per ADR-022. Non-bypassable when present. */
  moderator?: Moderator
}

async function defaultWhich(name: string): Promise<string | null> {
  return Bun.which(name) ?? null
}

export class ClaudeCodeBridge implements Bridge {
  readonly cli = "claude"
  private readonly runner: InjectableProcessRunner
  private readonly which: (name: string) => Promise<string | null>
  private readonly binary: string
  private readonly extraArgs: string[]
  private readonly timeoutMs?: number
  private readonly moderator?: Moderator
  private readonly inflight = new Map<string, ProcessHandle>()

  constructor(cfg: ClaudeCodeBridgeConfig = {}) {
    this.runner = cfg.runner ?? new ProcessRunner()
    this.which = cfg.which ?? defaultWhich
    this.binary = cfg.binary ?? "claude"
    this.extraArgs = cfg.extraArgs ?? ["--print", "--output-format=stream-json", "--verbose"]
    this.timeoutMs = cfg.timeoutMs
    this.moderator = cfg.moderator
  }

  async isAvailable(): Promise<boolean> {
    return (await this.which(this.binary)) !== null
  }

  async isAuthenticated(): Promise<AuthStatus> {
    return { authed: await this.isAvailable() }
  }

  capabilities(): Capabilities {
    return {
      modes: ["agentic", "oneshot"],
      contextWindow: 200_000,
      supportsTools: true,
      supportsSubagents: true,
      supportsStreaming: true,
      supportsMultimodal: true,
      supportsWebSearch: true,
      supportsMcp: true,
      preferredFor: ["code", "refactor", "planning", "reasoning"],
    }
  }

  estimateCost(_req: BridgeRequest): CostEstimate {
    return { costUsd: 0, tokensIn: 0, tokensOut: 0, subscriptionCovered: true }
  }

  execute(req: BridgeRequest): AsyncIterable<BridgeEvent> {
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        if (self.moderator) {
          const r = await self.moderator.check(req.prompt, "input")
          if (!r.allowed) {
            yield {
              type: "error",
              message: `safety: input blocked (${r.flags.map((f) => f.category).join(",")})`,
              recoverable: false,
            }
            return
          }
        }
        const handle = self.runner.spawn([self.binary, ...self.extraArgs], {
          cwd: req.cwd,
          stdin: req.prompt,
          timeoutMs: req.constraints?.maxDurationMs ?? self.timeoutMs,
        })
        self.inflight.set(req.taskId, handle)
        yield { type: "started", at: Date.now() } as BridgeEvent
        const stderrLines: string[] = []
        const stderrPromise = (async () => {
          for await (const line of handle.stderr) stderrLines.push(line)
        })()
        try {
          for await (const event of parseJsonlEvents(handle.stdout, self.cli)) {
            if (self.moderator && event.type === "text") {
              const r = await self.moderator.check(event.content, "output")
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
            yield { type: "error", message: `bridge claude: timed out`, recoverable: false }
          } else if (exit !== 0) {
            yield {
              type: "error",
              message: `bridge claude: exit ${exit}${
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
