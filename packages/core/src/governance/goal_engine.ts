import { OrphanGoalError } from "./errors.ts"
import type { GoalKind, GoalNode } from "./types.ts"

const HIERARCHY: GoalKind[] = ["mission", "objective", "project", "epic", "task", "ticket"]

const REQUIRED_PARENT: Partial<Record<GoalKind, GoalKind[]>> = {
  objective: ["mission"],
  project: ["objective"],
  epic: ["project"],
  task: ["project", "epic"],
  ticket: ["task"],
}

export class GoalEngine {
  private readonly nodes = new Map<string, GoalNode>()

  add(input: Omit<GoalNode, "createdAt">): GoalNode {
    const required = REQUIRED_PARENT[input.kind]
    if (required && required.length > 0) {
      if (!input.parentId) throw new OrphanGoalError(input.id, required[0]!)
      const parent = this.nodes.get(input.parentId)
      if (!parent) throw new OrphanGoalError(input.id, required[0]!)
      if (!required.includes(parent.kind)) {
        throw new OrphanGoalError(input.id, required.join("|"))
      }
    }
    const node: GoalNode = { createdAt: Date.now(), ...input }
    this.nodes.set(node.id, node)
    return node
  }

  get(id: string): GoalNode | undefined {
    return this.nodes.get(id)
  }

  children(parentId: string): GoalNode[] {
    return [...this.nodes.values()].filter((n) => n.parentId === parentId)
  }

  ancestors(id: string): GoalNode[] {
    const chain: GoalNode[] = []
    let current = this.nodes.get(id)?.parentId
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      const node = this.nodes.get(current)
      if (!node) break
      chain.push(node)
      current = node.parentId
    }
    return chain
  }

  prioritize(nodes: GoalNode[] = [...this.nodes.values()]): GoalNode[] {
    const riskWeight = { critical: 4, high: 3, medium: 2, low: 1 } as const
    return [...nodes].sort((a, b) => {
      const pa = a.priority ?? 0
      const pb = b.priority ?? 0
      if (pa !== pb) return pb - pa
      const ra = riskWeight[a.risk ?? "low"]
      const rb = riskWeight[b.risk ?? "low"]
      if (ra !== rb) return rb - ra
      return HIERARCHY.indexOf(a.kind) - HIERARCHY.indexOf(b.kind)
    })
  }
}
