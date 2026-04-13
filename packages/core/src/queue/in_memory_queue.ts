import { ulid } from "./ulid.ts"
import type {
  DequeueOptions,
  EnqueueOptions,
  MessageID,
  QueueAdapter,
  QueueCapabilities,
  QueueMessage,
} from "./types.ts"

interface Slot<T> {
  msg: QueueMessage<T>
  inFlight: boolean
}

export class InMemoryQueue implements QueueAdapter {
  private queues = new Map<string, Slot<unknown>[]>()

  private getQueue(name: string): Slot<unknown>[] {
    let q = this.queues.get(name)
    if (!q) {
      q = []
      this.queues.set(name, q)
    }
    return q
  }

  async enqueue<T>(queue: string, payload: T, opts: EnqueueOptions = {}): Promise<MessageID> {
    const id = ulid()
    const msg: QueueMessage<T> = {
      id,
      payload,
      idempotencyKey: opts.idempotencyKey ?? id,
      attempts: 0,
      enqueuedAt: Date.now(),
    }
    this.getQueue(queue).push({ msg: msg as QueueMessage<unknown>, inFlight: false })
    return id
  }

  async dequeue<T>(queue: string, opts: DequeueOptions = {}): Promise<QueueMessage<T>[]> {
    const count = opts.count ?? 1
    const q = this.getQueue(queue)
    const out: QueueMessage<T>[] = []
    for (const slot of q) {
      if (out.length >= count) break
      if (slot.inFlight) continue
      slot.inFlight = true
      slot.msg.attempts++
      out.push(slot.msg as QueueMessage<T>)
    }
    return out
  }

  async ack(queue: string, msg: QueueMessage): Promise<void> {
    const q = this.getQueue(queue)
    const idx = q.findIndex((s) => s.msg.id === msg.id)
    if (idx >= 0) q.splice(idx, 1)
  }

  async nack(queue: string, msg: QueueMessage, requeue = true): Promise<void> {
    const q = this.getQueue(queue)
    const slot = q.find((s) => s.msg.id === msg.id)
    if (!slot) return
    if (!requeue) {
      await this.ack(queue, msg)
      return
    }
    slot.inFlight = false
  }

  async depth(queue: string): Promise<number> {
    return this.getQueue(queue).filter((s) => !s.inFlight).length
  }

  capabilities(): QueueCapabilities {
    return {
      persistent: false,
      distributed: false,
      ordered: true,
      priority: false,
      dlq: false,
    }
  }
}
