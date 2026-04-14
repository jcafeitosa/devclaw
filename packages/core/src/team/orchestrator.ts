import type { CognitiveEngine } from "../cognitive/engine.ts"
import type { RunResult, Task } from "../cognitive/types.ts"
import type { PatternId, PatternResult } from "./patterns.ts"
import { runPattern } from "./patterns.ts"
import type { Team } from "./types.ts"

export interface TeamOrchestratorConfig {
  team: Team
  engine: CognitiveEngine
}

export interface TeamRunInput {
  task: Task
  pattern?: PatternId
}

export interface TeamRunResult {
  team: Team
  pattern: PatternResult
  run: RunResult
}

export class TeamOrchestrator {
  constructor(private readonly cfg: TeamOrchestratorConfig) {}

  get team(): Team {
    return this.cfg.team
  }

  async run(input: TeamRunInput): Promise<TeamRunResult> {
    const pattern = runPattern(input.pattern ?? "waterfall", {
      team: this.cfg.team,
      topic: input.task.goal,
    })
    const run = await this.cfg.engine.run(input.task)
    return { team: this.cfg.team, pattern, run }
  }
}
