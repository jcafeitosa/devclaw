import type { CognitiveEngine } from "../cognitive/engine.ts"
import type { RunResult } from "../cognitive/types.ts"
import { TeamAssembler } from "../team/assembler.ts"
import { TeamOrchestrator } from "../team/orchestrator.ts"
import type { PatternId } from "../team/patterns.ts"
import { getRole } from "../team/roles.ts"
import type { ProjectSpec, Team, TeamMember } from "../team/types.ts"
import { parseInvocation, validateInvocation } from "./invocation.ts"
import type { SlashRegistry } from "./registry.ts"
import type { SlashDefinition } from "./types.ts"

export interface SlashRunnerConfig {
  registry: SlashRegistry
  engine: CognitiveEngine
  assembler?: TeamAssembler
  defaultProject?: ProjectSpec
}

export interface SlashRunResult {
  command: string
  definition: SlashDefinition
  args: Record<string, string | number | boolean>
  team: Team
  run: RunResult
}

function renderTemplate(body: string, vars: Record<string, unknown>): string {
  return body.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, key: string) => {
    const parts = key.split(".")
    let cur: unknown = vars
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return ""
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur == null ? "" : String(cur)
  })
}

function projectFromDefinition(def: SlashDefinition, fallback?: ProjectSpec): ProjectSpec {
  const base: ProjectSpec = fallback ?? {
    id: `slash_${def.name}_${Date.now()}`,
    name: def.name,
    techStack: [],
  }
  return {
    ...base,
    totalBudgetUsd: def.budgetUsd ?? base.totalBudgetUsd,
  }
}

export class SlashRunner {
  private readonly assembler: TeamAssembler

  constructor(private readonly cfg: SlashRunnerConfig) {
    this.assembler = cfg.assembler ?? new TeamAssembler()
  }

  async execute(line: string, opts: { pattern?: PatternId } = {}): Promise<SlashRunResult> {
    const invocation = parseInvocation(line)
    const def = this.cfg.registry.get(invocation.name)
    const args = validateInvocation(def, invocation)
    const project = projectFromDefinition(def, this.cfg.defaultProject)
    const baseTeam = this.assembler.assemble(project)
    let team: Team = baseTeam
    if (def.agents) {
      const requested = new Set(def.agents)
      const existing = new Set(baseTeam.members.map((m) => m.role))
      const kept = baseTeam.members.filter((m) => requested.has(m.role))
      for (const role of requested) {
        if (!existing.has(role)) {
          const definition = getRole(role)
          const member: TeamMember = {
            role,
            definition,
            cli: definition.cliPreference[0] ?? "claude",
            budgetShare: definition.budgetShare,
          }
          kept.push(member)
        }
      }
      team = { ...baseTeam, members: kept }
    }
    const prompt = renderTemplate(def.body, { args, name: def.name })
    const orchestrator = new TeamOrchestrator({ team, engine: this.cfg.engine })
    const { run } = await orchestrator.run({
      task: {
        goal: prompt || def.description || def.name,
        expectedOutput: `output of /${def.name}`,
        agentId: "slash",
        maxSteps: def.maxTurns,
      },
      pattern: opts.pattern ?? "waterfall",
    })
    return { command: def.name, definition: def, args, team, run }
  }
}
