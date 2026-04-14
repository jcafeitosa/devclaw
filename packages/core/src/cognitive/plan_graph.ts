import { PlanCycleError } from "./errors.ts"
import type { Step, StepState, StepStatus } from "./types.ts"

function detectCycle(steps: Step[]): string[] | null {
  const byId = new Map(steps.map((s) => [s.id, s] as const))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []

  function visit(id: string): string[] | null {
    if (visited.has(id)) return null
    if (visiting.has(id)) {
      const idx = path.indexOf(id)
      return [...path.slice(idx), id]
    }
    visiting.add(id)
    path.push(id)
    const deps = byId.get(id)?.dependsOn ?? []
    for (const dep of deps) {
      if (!byId.has(dep)) continue
      const cycle = visit(dep)
      if (cycle) return cycle
    }
    visiting.delete(id)
    visited.add(id)
    path.pop()
    return null
  }

  for (const s of steps) {
    const cycle = visit(s.id)
    if (cycle) return cycle
  }
  return null
}

export class PlanGraph {
  private readonly steps: Step[]
  private readonly statuses = new Map<string, StepStatus>()

  constructor(steps: Step[]) {
    const cycle = detectCycle(steps)
    if (cycle) throw new PlanCycleError(cycle)
    this.steps = steps
    for (const s of steps) this.statuses.set(s.id, "pending")
  }

  ready(): Step[] {
    return this.steps
      .filter((s) => this.statuses.get(s.id) === "pending")
      .filter((s) => (s.dependsOn ?? []).every((d) => this.statuses.get(d) === "completed"))
      .slice()
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
  }

  complete(id: string): void {
    this.mustExist(id)
    this.statuses.set(id, "completed")
  }

  fail(id: string): void {
    this.mustExist(id)
    this.statuses.set(id, "failed")
  }

  start(id: string): void {
    this.mustExist(id)
    this.statuses.set(id, "running")
  }

  status(id: string): StepStatus {
    const st = this.statuses.get(id)
    if (!st) throw new Error(`plan_graph: unknown step '${id}'`)
    return st
  }

  isDone(): boolean {
    for (const s of this.steps) {
      if (this.statuses.get(s.id) === "pending" || this.statuses.get(s.id) === "running") {
        return false
      }
    }
    return true
  }

  states(): StepState[] {
    return this.steps.map((s) => ({ id: s.id, status: this.statuses.get(s.id) ?? "pending" }))
  }

  private mustExist(id: string): void {
    if (!this.statuses.has(id)) throw new Error(`plan_graph: unknown step '${id}'`)
  }
}
