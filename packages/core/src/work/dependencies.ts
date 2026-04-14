import { EventEmitter } from "../util/event_emitter.ts"
import { InvalidDependencyError, WorkCycleError, WorkNotFoundError } from "./errors.ts"
import type { WorkItemStore } from "./store.ts"
import type { CriticalPathResult, Dependency, DependencyType, WorkItem } from "./types.ts"

export interface DependencyEvents extends Record<string, unknown> {
  dependency_added: { dependency: Dependency }
  dependency_removed: { dependency: Dependency }
  dependency_satisfied: { dependency: Dependency; satisfiedBy: WorkItem }
}

const BLOCKING_TYPES: DependencyType[] = [
  "blocked_by",
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
]

function isBlocking(type: DependencyType): boolean {
  return BLOCKING_TYPES.includes(type)
}

export class DependencyEngine {
  readonly events = new EventEmitter<DependencyEvents>()
  private readonly deps = new Map<string, Dependency>()
  private readonly byFrom = new Map<string, Set<string>>()
  private readonly byTo = new Map<string, Set<string>>()

  constructor(private readonly store: WorkItemStore) {}

  add(input: Omit<Dependency, "id" | "createdAt">): Dependency {
    if (input.from === input.to) {
      throw new InvalidDependencyError(input.from, input.to, "self-loop")
    }
    this.store.get(input.from)
    this.store.get(input.to)
    if (isBlocking(input.type) && this.wouldCycle(input.from, input.to)) {
      const path = this.findCyclePath(input.to, input.from) ?? [input.from, input.to, input.from]
      throw new WorkCycleError(path)
    }
    const id = `dep_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const dep: Dependency = { id, createdAt: Date.now(), ...input }
    this.deps.set(id, dep)
    this.addIndex(dep)
    this.events.emit("dependency_added", { dependency: dep })
    return dep
  }

  remove(id: string): void {
    const dep = this.deps.get(id)
    if (!dep) return
    this.deps.delete(id)
    this.removeIndex(dep)
    this.events.emit("dependency_removed", { dependency: dep })
  }

  outgoing(itemId: string): Dependency[] {
    return [...(this.byFrom.get(itemId) ?? [])]
      .map((id) => this.deps.get(id))
      .filter((d): d is Dependency => Boolean(d))
  }

  incoming(itemId: string): Dependency[] {
    return [...(this.byTo.get(itemId) ?? [])]
      .map((id) => this.deps.get(id))
      .filter((d): d is Dependency => Boolean(d))
  }

  markSatisfied(dependencyId: string): Dependency {
    const dep = this.deps.get(dependencyId)
    if (!dep) throw new WorkNotFoundError(dependencyId)
    let resolver: WorkItem
    try {
      resolver = this.store.get(dep.from)
    } catch {
      resolver = this.store.get(dep.to)
    }
    this.events.emit("dependency_satisfied", { dependency: dep, satisfiedBy: resolver })
    return dep
  }

  isBlocked(itemId: string): boolean {
    for (const depId of this.byFrom.get(itemId) ?? []) {
      const dep = this.deps.get(depId)
      if (!dep) continue
      if (!isBlocking(dep.type)) continue
      const blocker = this.store.get(dep.to)
      if (blocker.status !== "done" && blocker.status !== "cancelled") return true
    }
    return false
  }

  criticalPath(rootIds: string[]): CriticalPathResult {
    const items = new Set<string>()
    const collect = (id: string) => {
      if (items.has(id)) return
      items.add(id)
      for (const dep of this.outgoing(id)) {
        if (isBlocking(dep.type)) collect(dep.to)
      }
    }
    for (const r of rootIds) collect(r)
    const itemList = [...items]
    const durationOf = (id: string): number => this.store.get(id).estimateMs ?? 0

    const orderIn = new Map<string, number>()
    const predecessors = new Map<string, string[]>()
    for (const id of itemList) predecessors.set(id, [])
    for (const id of itemList) {
      for (const dep of this.outgoing(id)) {
        if (!items.has(dep.to) || !isBlocking(dep.type)) continue
        predecessors.get(dep.to)?.push(id)
        orderIn.set(dep.to, (orderIn.get(dep.to) ?? 0) + 1)
      }
    }

    const topo: string[] = []
    const ready: string[] = itemList.filter((id) => (orderIn.get(id) ?? 0) === 0)
    while (ready.length > 0) {
      const id = ready.shift()!
      topo.push(id)
      for (const dep of this.outgoing(id)) {
        if (!items.has(dep.to) || !isBlocking(dep.type)) continue
        const next = (orderIn.get(dep.to) ?? 0) - 1
        orderIn.set(dep.to, next)
        if (next === 0) ready.push(dep.to)
      }
    }

    const earliestFinish = new Map<string, number>()
    for (const id of topo) {
      const preds = predecessors.get(id) ?? []
      const earliestStart = preds.reduce(
        (max, pid) => Math.max(max, earliestFinish.get(pid) ?? 0),
        0,
      )
      earliestFinish.set(id, earliestStart + durationOf(id))
    }

    const projectDuration = Math.max(0, ...earliestFinish.values())
    const latestFinish = new Map<string, number>()
    for (const id of [...topo].reverse()) {
      const successors = this.outgoing(id)
        .filter((d) => items.has(d.to) && isBlocking(d.type))
        .map((d) => d.to)
      if (successors.length === 0) {
        latestFinish.set(id, projectDuration)
        continue
      }
      const latest = successors.reduce((min, sid) => {
        const sFinish = latestFinish.get(sid) ?? projectDuration
        const sStart = sFinish - durationOf(sid)
        return Math.min(min, sStart)
      }, Number.POSITIVE_INFINITY)
      latestFinish.set(id, latest)
    }

    const slack = new Map<string, number>()
    const critical: string[] = []
    for (const id of topo) {
      const ef = earliestFinish.get(id) ?? 0
      const lf = latestFinish.get(id) ?? projectDuration
      const s = lf - ef
      slack.set(id, s)
      if (s <= 0) critical.push(id)
    }
    return { items: critical, totalMs: projectDuration, slack }
  }

  private wouldCycle(from: string, to: string): boolean {
    if (to === from) return true
    const visited = new Set<string>()
    const stack = [to]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || visited.has(current)) continue
      visited.add(current)
      if (current === from) return true
      for (const dep of this.outgoing(current)) {
        if (isBlocking(dep.type)) stack.push(dep.to)
      }
    }
    return false
  }

  private findCyclePath(start: string, back: string): string[] | null {
    const path: string[] = []
    const visit = (id: string, visited: Set<string>): boolean => {
      if (visited.has(id)) return false
      visited.add(id)
      path.push(id)
      if (id === back) return true
      for (const dep of this.outgoing(id)) {
        if (!isBlocking(dep.type)) continue
        if (visit(dep.to, visited)) return true
      }
      path.pop()
      return false
    }
    if (visit(start, new Set())) {
      path.push(back)
      return path
    }
    return null
  }

  private addIndex(dep: Dependency): void {
    if (!this.byFrom.has(dep.from)) this.byFrom.set(dep.from, new Set())
    if (!this.byTo.has(dep.to)) this.byTo.set(dep.to, new Set())
    this.byFrom.get(dep.from)!.add(dep.id)
    this.byTo.get(dep.to)!.add(dep.id)
  }

  private removeIndex(dep: Dependency): void {
    this.byFrom.get(dep.from)?.delete(dep.id)
    this.byTo.get(dep.to)?.delete(dep.id)
  }
}
