import type { RunResult } from "../cognitive/types.ts"
import type { MemoryService } from "../memory/service.ts"
import type { Evaluator } from "./evaluator.ts"
import { persistLessons } from "./learning.ts"
import type { Reflector } from "./reflector.ts"
import type { Evaluation, Reflection } from "./types.ts"

export interface ReflectionPipelineConfig {
  evaluator: Evaluator
  reflector: Reflector
  memory: MemoryService
}

export interface PipelineResult {
  reflection: Reflection
  evaluationErrors: Array<{ stepId: string; message: string }>
  persistedLessonIds: string[]
}

export class ReflectionPipeline {
  constructor(private readonly cfg: ReflectionPipelineConfig) {}

  async run(runResult: RunResult): Promise<PipelineResult> {
    const evaluations: Evaluation[] = []
    const evaluationErrors: Array<{ stepId: string; message: string }> = []
    const states = new Map(runResult.states.map((s) => [s.id, s] as const))
    for (const step of runResult.plan.steps) {
      const state = states.get(step.id) ?? { id: step.id, status: "pending" as const }
      try {
        evaluations.push(await this.cfg.evaluator.evaluate(step, state))
      } catch (err) {
        evaluationErrors.push({
          stepId: step.id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    const reflection = await this.cfg.reflector.reflect({ runResult, evaluations })
    const persistedLessonIds = await persistLessons(this.cfg.memory, reflection.lessons)
    return { reflection, evaluationErrors, persistedLessonIds }
  }
}
