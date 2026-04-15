export type MessageID = string

export interface QueueMessage<T = unknown> {
  id: MessageID
  payload: T
  idempotencyKey: string
  attempts: number
  enqueuedAt: number
  meta?: Record<string, string>
}

export interface EnqueueOptions {
  idempotencyKey?: string
  priority?: "low" | "normal" | "high"
}

export interface DequeueOptions {
  timeoutMs?: number
  count?: number
}

export interface QueueCapabilities {
  persistent: boolean
  distributed: boolean
  ordered: boolean
  priority: boolean
  dlq: boolean
}

export type QueueKind = "redis-streams" | "kafka" | "memory"

export interface QueueAdapter {
  readonly kind: QueueKind
  enqueue<T>(queue: string, payload: T, opts?: EnqueueOptions): Promise<MessageID>
  dequeue<T>(queue: string, opts?: DequeueOptions): Promise<QueueMessage<T>[]>
  ack(queue: string, msg: QueueMessage): Promise<void>
  nack(queue: string, msg: QueueMessage, requeue?: boolean): Promise<void>
  reclaim<T>(queue: string, minIdleMs?: number): Promise<QueueMessage<T>[]>
  depth(queue: string): Promise<number>
  close(): Promise<void>
  capabilities(): QueueCapabilities
}
