import type { PlanGraph } from "./plan_graph.ts"
import type { Step } from "./types.ts"

export interface Reasoner {
  pick(graph: PlanGraph): Step | null
}

export class DefaultReasoner implements Reasoner {
  pick(graph: PlanGraph): Step | null {
    const ready = graph.ready()
    return ready[0] ?? null
  }
}
