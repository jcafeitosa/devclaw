import type { SafetyKernel } from "../kernel/index.ts"
import type { MemoryService } from "../memory/service.ts"
import { SafetyViolationError } from "../safety/errors.ts"
import { createDefaultModerator } from "../safety/moderator.ts"
import type { Moderator } from "../safety/types.ts"
import { MaxStepsExceededError, StepFailedError } from "./errors.ts"
import { PlanGraph } from "./plan_graph.ts"
import type { Planner } from "./planner.ts"
import type { Reasoner } from "./reasoner.ts"
import type { ModelRouter } from "./router.ts"
import type { StepExecutor } from "./step_executor.ts"
import type { Plan, RunResult, StepContext, StepState, Task, Tier } from "./types.ts"

export interface CognitiveEngineConfig {
  planner: Planner
  reasoner: Reasoner
  router: ModelRouter
  executor: StepExecutor
  memory: MemoryService
  kernel?: SafetyKernel
  moderator?: Moderator
  maxSteps?: number
  defaultTier?: Tier
  onStepCompleted?: (ctx: StepContext, state: StepState) => void | Promise<void>
  onStepFailed?: (ctx: StepContext, state: StepState) => void | Promise<void>
}

function nextEpisodeId(): string {
  return `ep_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export class CognitiveEngine {
  constructor(private readonly cfg: CognitiveEngineConfig) {}

  async run(task: Task): Promise<RunResult> {
    const plan = await this.cfg.planner.plan(task)
    const graph = new PlanGraph(plan.steps)
    const states = new Map<string, StepState>()
    for (const s of plan.steps) states.set(s.id, { id: s.id, status: "pending" })
    const episodes: string[] = []
    const deadline = task.deadlineMs ? Date.now() + task.deadlineMs : undefined
    const maxSteps = task.maxSteps ?? this.cfg.maxSteps ?? 20
    const defaultTier: Tier = this.cfg.defaultTier ?? "executor"
    let iterations = 0

    while (!graph.isDone()) {
      if (iterations >= maxSteps) throw new MaxStepsExceededError(maxSteps)
      if (deadline && Date.now() > deadline) {
        return this.finalize(plan, states, episodes, "deadline", false)
      }
      const step = this.cfg.reasoner.pick(graph)
      if (!step) {
        return this.finalize(plan, states, episodes, "step_failed", false)
      }
      iterations++
      const tier = step.tier ?? defaultTier
      const route = this.cfg.router.choose(tier)
      graph.start(step.id)
      const state = states.get(step.id) ?? { id: step.id, status: "pending" }
      state.status = "running"
      state.startedAt = Date.now()
      state.provider = route.providerId
      state.model = route.model
      states.set(step.id, state)

      const priorStates: StepState[] = [...states.values()]
      const ctx: StepContext = {
        task,
        plan,
        step,
        route,
        priorStates,
      }
      const started = state.startedAt
      try {
        const { output } = this.cfg.kernel
          ? await this.executeWithKernel(task, ctx)
          : await this.cfg.executor.execute(ctx)
        if (!this.cfg.kernel) await this.assertSafeOutput(output)
        state.status = "completed"
        state.completedAt = Date.now()
        state.output = output
        graph.complete(step.id)
        const epId = nextEpisodeId()
        await this.cfg.memory.recordEpisode({
          id: epId,
          taskId: task.goal,
          outcome: "success",
          content: `step ${step.id}: ${step.description}`,
          at: Date.now(),
          durationMs: Date.now() - (started ?? Date.now()),
          agentId: task.agentId,
          sessionId: task.sessionId,
        })
        episodes.push(epId)
        if (this.cfg.onStepCompleted) await this.cfg.onStepCompleted(ctx, state)
      } catch (cause) {
        state.status = "failed"
        state.completedAt = Date.now()
        state.error = cause instanceof Error ? cause.message : String(cause)
        graph.fail(step.id)
        const epId = nextEpisodeId()
        await this.cfg.memory.recordEpisode({
          id: epId,
          taskId: task.goal,
          outcome: "failure",
          content: `step ${step.id} failed: ${state.error}`,
          at: Date.now(),
          durationMs: Date.now() - (started ?? Date.now()),
          agentId: task.agentId,
          sessionId: task.sessionId,
        })
        episodes.push(epId)
        if (this.cfg.onStepFailed) await this.cfg.onStepFailed(ctx, state)
        throw new StepFailedError(step.id, cause)
      }
    }
    return this.finalize(plan, states, episodes, "done", true)
  }

  private async executeWithKernel(
    task: Task,
    ctx: StepContext,
  ): Promise<{ output: unknown }> {
    const self = this
    let output: unknown
    for await (const _event of this.cfg.kernel!.invoke(
      {
        actor: task.agentId ?? "cognitive",
        sessionId: task.sessionId,
        taskId: task.goal,
      },
      {
        kind: "cognitive",
        tool: ctx.route.providerId,
        action: "cognitive.step",
        inputText: `${task.goal}\n${ctx.step.description}`,
        input: {
          goal: task.goal,
          stepId: ctx.step.id,
          providerId: ctx.route.providerId,
        },
        target: ctx.step.id,
        execute: async function* () {
          const result = await self.cfg.executor.execute(ctx)
          output = result.output
          const text =
            typeof output === "string"
              ? output
              : output === undefined
                ? ""
                : JSON.stringify(output)
          if (text) yield { type: "text" as const, content: text }
          yield { type: "completed" as const }
        },
      },
    )) {
      // Kernel handles safety/permission/audit gating.
    }
    return { output }
  }

  private finalize(
    plan: Plan,
    states: Map<string, StepState>,
    episodes: string[],
    reason: RunResult["reason"],
    completed: boolean,
  ): RunResult {
    return {
      plan,
      states: plan.steps.map((s) => states.get(s.id) ?? { id: s.id, status: "pending" }),
      episodes,
      completed,
      reason,
    }
  }

  private async assertSafeOutput(output: unknown): Promise<void> {
    const text = this.outputText(output)
    if (!text) return
    const moderator = this.cfg.moderator ?? createDefaultModerator()
    const moderation = await moderator.check(text, "output")
    if (moderation.flags.length === 0) return
    throw new SafetyViolationError("output", moderation.flags)
  }

  private outputText(output: unknown): string | null {
    if (typeof output === "string") return output
    if (typeof output === "number" || typeof output === "boolean") return String(output)
    if (!output) return null
    try {
      return JSON.stringify(output)
    } catch {
      return String(output)
    }
  }
}
