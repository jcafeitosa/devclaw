export type ChannelType = "human" | "agent" | "hybrid" | "system" | "task"

export interface AccessPolicy {
  readers?: string[]
  writers?: string[]
  publicRead?: boolean
  publicWrite?: boolean
}

export interface Channel {
  id: string
  name: string
  type: ChannelType
  topic?: string
  projectId?: string
  taskId?: string
  members: string[]
  policy: AccessPolicy
  createdAt: number
}

export interface CommMessage {
  id: string
  channelId: string
  threadId?: string
  from: string
  content: string
  at: number
  meta?: Record<string, string>
}

export interface ThreadLinks {
  projectId?: string
  taskId?: string
  decisionId?: string
  eventIds?: string[]
}

export interface Thread {
  id: string
  channelId: string
  title: string
  openedBy: string
  links: ThreadLinks
  open: boolean
  createdAt: number
  closedAt?: number
  closedBy?: string
  closedReason?: string
}

export type NotificationType =
  | "mention"
  | "assignment"
  | "blocker"
  | "approval"
  | "budget-warning"
  | "incident"

export type NotificationPriority = "low" | "normal" | "high" | "urgent"

export interface Notification {
  id: string
  type: NotificationType
  priority: NotificationPriority
  to: string
  title: string
  body: string
  data?: Record<string, string>
  createdAt: number
  deliveredTo?: string[]
}

export interface DeliveryChannelResult {
  channel: string
  delivered: boolean
  error?: string
}

export type CommMode = "direct" | "broadcast" | "channel" | "event"

export interface CommEvent<T = unknown> {
  id: string
  mode: CommMode
  from: string
  to?: string | string[]
  channelId?: string
  topic?: string
  payload: T
  at: number
}
