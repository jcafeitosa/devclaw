import { EventEmitter } from "../util/event_emitter.ts"
import type { WorkItem, WorkStatus } from "./types.ts"

export type WorkflowTrigger =
  | "item-created"
  | "item-moved"
  | "dep-unblocked"
  | "budget-exceeded"
  | "deadline-missed"
  | "agent-failed"

export type WorkflowActionType =
  | "reassign"
  | "create-subtask"
  | "trigger-agent"
  | "notify"
  | "escalate"
  | "freeze"

export interface WorkflowAction {
  type: WorkflowActionType
  params?: Record<string, string>
}

export interface WorkflowCondition {
  kind?: WorkItem["kind"][]
  status?: WorkStatus[]
  tag?: string
  priorityAtLeast?: WorkItem["priority"]
}

export interface WorkflowRule {
  id: string
  trigger: WorkflowTrigger
  condition?: WorkflowCondition
  actions: WorkflowAction[]
}

export interface TriggerContext {
  trigger: WorkflowTrigger
  item?: WorkItem
  meta?: Record<string, string>
}

export interface ExecutedAction {
  ruleId: string
  action: WorkflowAction
  item?: WorkItem
}

const PRIORITY_ORDER: Record<WorkItem["priority"], number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
}

function matchesCondition(
  condition: WorkflowCondition | undefined,
  item: WorkItem | undefined,
): boolean {
  if (!condition) return true
  if (!item) return false
  if (condition.kind && !condition.kind.includes(item.kind)) return false
  if (condition.status && !condition.status.includes(item.status)) return false
  if (condition.tag && !(item.tags ?? []).includes(condition.tag)) return false
  if (condition.priorityAtLeast) {
    if (PRIORITY_ORDER[item.priority] < PRIORITY_ORDER[condition.priorityAtLeast]) return false
  }
  return true
}

export interface WorkflowEvents extends Record<string, unknown> {
  action_executed: ExecutedAction
}

export class WorkflowEngine {
  private readonly rules: WorkflowRule[] = []
  readonly events = new EventEmitter<WorkflowEvents>()

  register(rule: WorkflowRule): void {
    if (this.rules.some((r) => r.id === rule.id)) {
      throw new Error(`workflow: rule '${rule.id}' already registered`)
    }
    this.rules.push(rule)
  }

  rulesFor(trigger: WorkflowTrigger): WorkflowRule[] {
    return this.rules.filter((r) => r.trigger === trigger)
  }

  dispatch(ctx: TriggerContext): ExecutedAction[] {
    const executed: ExecutedAction[] = []
    for (const rule of this.rulesFor(ctx.trigger)) {
      if (!matchesCondition(rule.condition, ctx.item)) continue
      for (const action of rule.actions) {
        const record: ExecutedAction = { ruleId: rule.id, action, item: ctx.item }
        executed.push(record)
        this.events.emit("action_executed", record)
      }
    }
    return executed
  }
}
