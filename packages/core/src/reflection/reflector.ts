import { ReflectFailedError } from "./errors.ts"
import type {
  CorrectionProposal,
  Lesson,
  ReflectInput,
  Reflection,
  ReflectionOutcome,
} from "./types.ts"

export interface Reflector {
  reflect(input: ReflectInput): Promise<Reflection>
}

export interface DefaultReflectorConfig {
  degradedThreshold?: number
  lessonMaxLength?: number
}

function nextLessonId(): string {
  return `lesson_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export class DefaultReflector implements Reflector {
  private readonly degradedThreshold: number
  private readonly lessonMaxLength: number

  constructor(cfg: DefaultReflectorConfig = {}) {
    this.degradedThreshold = cfg.degradedThreshold ?? 0.8
    this.lessonMaxLength = cfg.lessonMaxLength ?? 280
  }

  async reflect({ runResult, evaluations }: ReflectInput): Promise<Reflection> {
    try {
      const evalMap = new Map(evaluations.map((e) => [e.stepId, e] as const))
      const corrections: CorrectionProposal[] = []
      const lessons: Lesson[] = []
      const taskId = runResult.plan.goal
      let hadFailure = false
      let hadIncomplete = false
      let hadDegraded = false

      for (const state of runResult.states) {
        if (state.status === "failed") hadFailure = true
        if (state.status === "pending" || state.status === "running") hadIncomplete = true
      }

      for (const state of runResult.states) {
        const ev = evalMap.get(state.id)
        if (state.status === "failed") {
          corrections.push({
            action: "retry",
            stepId: state.id,
            rationale: state.error ?? "step failed without explicit error",
          })
          lessons.push({
            id: nextLessonId(),
            content: this.trim(
              `Failure on step "${state.id}": ${state.error ?? "unknown error"}. Investigate before retry.`,
            ),
            tags: ["reflection", "failure", taskId],
            source: "reflection",
            relatesTo: { taskId, stepIds: [state.id] },
          })
          continue
        }
        if (ev?.passed && ev.score < this.degradedThreshold) {
          hadDegraded = true
          corrections.push({
            action: "replace",
            stepId: state.id,
            rationale: `Passed but low quality (score=${ev.score.toFixed(2)}); consider rework.`,
          })
        }
      }

      if (!hadFailure && !hadIncomplete && runResult.completed) {
        lessons.push({
          id: nextLessonId(),
          content: this.trim(
            `Task "${taskId}" completed successfully with ${runResult.states.length} steps.`,
          ),
          tags: ["reflection", "success", taskId],
          source: "reflection",
          relatesTo: { taskId, stepIds: runResult.states.map((s) => s.id) },
        })
      }

      const outcome: ReflectionOutcome = hadFailure
        ? "failed"
        : hadIncomplete
          ? "partial"
          : hadDegraded
            ? "degraded"
            : "all_ok"

      const summary = this.buildSummary(runResult, outcome, corrections, lessons)
      return { taskId, outcome, evaluations, corrections, lessons, summary }
    } catch (cause) {
      throw new ReflectFailedError(cause)
    }
  }

  private trim(text: string): string {
    return text.length > this.lessonMaxLength ? `${text.slice(0, this.lessonMaxLength - 1)}…` : text
  }

  private buildSummary(
    runResult: { plan: { goal: string }; states: { id: string; status: string }[] },
    outcome: ReflectionOutcome,
    corrections: CorrectionProposal[],
    lessons: Lesson[],
  ): string {
    const steps = runResult.states.length
    return `Task "${runResult.plan.goal}" — ${outcome} (${steps} steps, ${corrections.length} corrections, ${lessons.length} lessons).`
  }
}
