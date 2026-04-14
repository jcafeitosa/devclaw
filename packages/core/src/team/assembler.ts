import { getRole } from "./roles.ts"
import type { ProjectSpec, RoleId, Team, TeamMember } from "./types.ts"

const BACKEND_HINTS = ["bun", "node", "elysia", "hono", "express", "postgres", "rust", "go"]
const FRONTEND_HINTS = ["astro", "solid", "react", "vue", "svelte", "next", "nuxt", "remix"]

function hasAny(stack: string[], hints: string[]): boolean {
  const set = new Set(stack.map((s) => s.toLowerCase()))
  return hints.some((h) => set.has(h))
}

function riskAtLeastMedium(risk?: ProjectSpec["riskClass"]): boolean {
  return risk === "medium" || risk === "high" || risk === "critical"
}

export interface TeamAssemblerConfig {
  defaultBudgetUsd?: number
  defaultTokenBudget?: number
}

export class TeamAssembler {
  constructor(private readonly cfg: TeamAssemblerConfig = {}) {}

  assemble(project: ProjectSpec): Team {
    const roles = new Set<RoleId>(["pm", "coordinator"])

    if (project.hasDesignPhase) roles.add("architect")
    if (hasAny(project.techStack, BACKEND_HINTS)) roles.add("backend")
    if (hasAny(project.techStack, FRONTEND_HINTS)) roles.add("frontend")
    if (project.hasDatabaseChanges) roles.add("data")
    if (riskAtLeastMedium(project.riskClass)) roles.add("security")
    if (project.isReleaseTarget) {
      roles.add("qa")
      roles.add("sre")
    }
    if (project.publicFacing) roles.add("doc")
    if (project.usesNewTech) roles.add("research")

    const defs = [...roles].map((id) => getRole(id))
    const shareSum = defs.reduce((n, d) => n + d.budgetShare, 0) || 1
    const members: TeamMember[] = defs.map((def) => ({
      role: def.id,
      definition: def,
      cli: def.cliPreference[0] ?? "claude",
      budgetShare: def.budgetShare / shareSum,
    }))

    return {
      project,
      members,
      totalBudgetUsd: project.totalBudgetUsd ?? this.cfg.defaultBudgetUsd ?? 25,
      totalTokenBudget: project.totalTokenBudget ?? this.cfg.defaultTokenBudget ?? 500_000,
    }
  }
}
