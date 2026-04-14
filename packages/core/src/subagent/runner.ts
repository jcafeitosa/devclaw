import type { ContextObject } from "../context/types.ts"
import { EventEmitter } from "../util/event_emitter.ts"
import { BudgetGuard } from "./budget.ts"
import { filterContextForSubagent } from "./context_filter.ts"
import {
  BudgetExceededError,
  DelegateStrippedError,
  SubagentError,
  SubagentExecFailedError,
} from "./errors.ts"
import type { IsolationProvider } from "./isolation/none.ts"
import type { SubagentEventMap, SubagentResult, SubagentSpec } from "./types.ts"

export interface SubagentExecInput<T = unknown> {
  task: T
  workdir: string
  env?: Record<string, string>
  context?: ContextObject
  report(sample: { costUsd?: number; tokens?: number; tool?: string }): void
}

export type SubagentExecutor<T = unknown, O = unknown> = (input: SubagentExecInput<T>) => Promise<O>

export interface SubagentRunnerConfig {
  providers: Partial<Record<SubagentSpec["isolation"], IsolationProvider>>
}

export class SubagentRunner {
  private readonly providers: SubagentRunnerConfig["providers"]
  readonly events = new EventEmitter<SubagentEventMap>()
  private readonly activeChildren = new Set<string>()
  private delegationStripped = new Set<string>()

  constructor(cfg: SubagentRunnerConfig) {
    this.providers = cfg.providers
  }

  async run<T, O>(
    spec: SubagentSpec<T>,
    executor: SubagentExecutor<T, O>,
  ): Promise<SubagentResult<O>> {
    if (this.delegationStripped.has(spec.parentId)) {
      throw new DelegateStrippedError(spec.id)
    }
    const provider = this.providers[spec.isolation]
    if (!provider) {
      throw new SubagentError(
        `isolation provider '${spec.isolation}' not configured`,
        "NOT_SUPPORTED",
        spec.id,
      )
    }
    const alloc = await provider.allocate({ subagentId: spec.id, cwd: spec.cwd })
    const guard = new BudgetGuard(spec.id, spec.restrictions)
    let toolCalls = 0
    const filteredContext = spec.context
      ? filterContextForSubagent({ parent: spec.context, restrictions: spec.restrictions })
      : undefined
    if (spec.restrictions?.delegateStripping) {
      this.delegationStripped.add(spec.id)
    }
    this.events.emit("subagent_spawned", { spec, workdir: alloc.workdir })
    this.activeChildren.add(spec.id)

    const report: SubagentExecInput<T>["report"] = (sample) => {
      toolCalls += sample.tool ? 1 : 0
      guard.add({ costUsd: sample.costUsd, tokens: sample.tokens })
      if (sample.tool) {
        this.events.emit("subagent_tool_called", {
          subagentId: spec.id,
          tool: sample.tool,
          cost: sample.costUsd ?? 0,
          tokens: sample.tokens ?? 0,
        })
      }
    }

    try {
      const output = await executor({
        task: spec.task,
        workdir: alloc.workdir,
        env: alloc.env,
        context: filteredContext,
        report,
      })
      guard.enforce()
      const snap = guard.snapshot()
      const result: SubagentResult<O> = {
        subagentId: spec.id,
        parentId: spec.parentId,
        status: "success",
        output,
        metrics: { ...snap, toolCalls },
        workdir: alloc.workdir,
      }
      this.events.emit("subagent_completed", { subagentId: spec.id, result })
      return result
    } catch (err) {
      const snap = guard.snapshot()
      const status: SubagentResult["status"] =
        err instanceof BudgetExceededError ? "budget_exceeded" : "failed"
      const message = err instanceof Error ? err.message : String(err)
      const result: SubagentResult<O> = {
        subagentId: spec.id,
        parentId: spec.parentId,
        status,
        error: message,
        metrics: { ...snap, toolCalls },
        workdir: alloc.workdir,
      }
      this.events.emit("subagent_failed", {
        subagentId: spec.id,
        error: message,
        code: err instanceof SubagentError ? err.code : "EXEC_FAILED",
      })
      if (err instanceof BudgetExceededError || err instanceof SubagentError) {
        return result
      }
      throw new SubagentExecFailedError(spec.id, err)
    } finally {
      this.activeChildren.delete(spec.id)
      this.delegationStripped.delete(spec.id)
      try {
        await alloc.cleanup()
      } catch {
        // best-effort
      }
    }
  }

  activeCount(): number {
    return this.activeChildren.size
  }
}
