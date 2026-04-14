import { DeliveryFailedError } from "./errors.ts"
import type {
  DeliveryChannelResult,
  Notification,
  NotificationPriority,
  NotificationType,
} from "./types.ts"

export type DeliveryDispatcher = (notification: Notification) => Promise<void> | void

export interface NotificationCenterConfig {
  dispatchers?: Record<string, DeliveryDispatcher>
  defaultDelivery?: string[]
  priorityRouting?: Partial<Record<NotificationPriority, string[]>>
}

export interface EmitInput {
  type: NotificationType
  priority?: NotificationPriority
  to: string
  title: string
  body: string
  data?: Record<string, string>
  delivery?: string[]
}

export interface EmitResult {
  notification: Notification
  delivered: DeliveryChannelResult[]
}

export class NotificationCenter {
  private readonly dispatchers: Map<string, DeliveryDispatcher>
  private readonly defaultDelivery: string[]
  private readonly priorityRouting: Partial<Record<NotificationPriority, string[]>>
  private readonly log: Notification[] = []

  constructor(cfg: NotificationCenterConfig = {}) {
    this.dispatchers = new Map(Object.entries(cfg.dispatchers ?? {}))
    this.defaultDelivery = cfg.defaultDelivery ?? ["in-app"]
    this.priorityRouting = cfg.priorityRouting ?? {}
    if (!this.dispatchers.has("in-app")) {
      this.dispatchers.set("in-app", (n) => {
        this.log.push(n)
      })
    }
  }

  addDispatcher(name: string, dispatcher: DeliveryDispatcher): void {
    this.dispatchers.set(name, dispatcher)
  }

  inbox(recipient: string): Notification[] {
    return this.log.filter((n) => n.to === recipient).map((n) => ({ ...n }))
  }

  async emit(input: EmitInput): Promise<EmitResult> {
    const priority = input.priority ?? defaultPriority(input.type)
    const notification: Notification = {
      id: `ntf_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      type: input.type,
      priority,
      to: input.to,
      title: input.title,
      body: input.body,
      data: input.data,
      createdAt: Date.now(),
    }
    const channels = input.delivery ?? this.priorityRouting[priority] ?? this.defaultDelivery
    const delivered: DeliveryChannelResult[] = []
    const failures: Array<{ channel: string; error: string }> = []
    const succeeded: string[] = []
    for (const name of channels) {
      const dispatcher = this.dispatchers.get(name)
      if (!dispatcher) {
        failures.push({ channel: name, error: "dispatcher not registered" })
        delivered.push({ channel: name, delivered: false, error: "dispatcher not registered" })
        continue
      }
      try {
        await dispatcher(notification)
        delivered.push({ channel: name, delivered: true })
        succeeded.push(name)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        delivered.push({ channel: name, delivered: false, error: message })
        failures.push({ channel: name, error: message })
      }
    }
    notification.deliveredTo = succeeded
    if (succeeded.length === 0 && failures.length > 0) {
      throw new DeliveryFailedError(failures)
    }
    return { notification, delivered }
  }
}

function defaultPriority(type: NotificationType): NotificationPriority {
  switch (type) {
    case "incident":
      return "urgent"
    case "blocker":
    case "approval":
      return "high"
    case "budget-warning":
      return "high"
    case "assignment":
    case "mention":
      return "normal"
    default:
      return "normal"
  }
}
