import { RedisClient } from "bun"
import type {
  DequeueOptions,
  EnqueueOptions,
  MessageID,
  QueueAdapter,
  QueueCapabilities,
  QueueMessage,
} from "./types.ts"

export interface BunRedisStreamsConfig {
  url: string
  group: string
  consumer: string
  blockMs?: number
}

export class BunRedisStreamsQueue implements QueueAdapter {
  readonly kind = "redis-streams" as const
  private client: RedisClient
  private cfg: Required<BunRedisStreamsConfig>

  constructor(cfg: BunRedisStreamsConfig) {
    this.cfg = { blockMs: 5000, ...cfg }
    this.client = new RedisClient(cfg.url)
  }

  async ensureGroup(queue: string): Promise<void> {
    try {
      await this.client.send("XGROUP", ["CREATE", queue, this.cfg.group, "$", "MKSTREAM"])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes("BUSYGROUP")) throw err
    }
  }

  async enqueue<T>(queue: string, payload: T, opts: EnqueueOptions = {}): Promise<MessageID> {
    await this.ensureGroup(queue)
    const idemKey = opts.idempotencyKey ?? crypto.randomUUID()
    const id = (await this.client.send("XADD", [
      queue,
      "*",
      "payload",
      JSON.stringify(payload),
      "idem",
      idemKey,
      "attempts",
      "0",
      "ts",
      String(Date.now()),
    ])) as string
    return id
  }

  async dequeue<T>(queue: string, opts: DequeueOptions = {}): Promise<QueueMessage<T>[]> {
    await this.ensureGroup(queue)
    const count = opts.count ?? 1
    const block = opts.timeoutMs ?? this.cfg.blockMs
    const res = (await this.client.send("XREADGROUP", [
      "GROUP",
      this.cfg.group,
      this.cfg.consumer,
      "BLOCK",
      String(block),
      "COUNT",
      String(count),
      "STREAMS",
      queue,
      ">",
    ])) as Record<string, [string, string[]][]> | null
    if (!res) return []
    const out: QueueMessage<T>[] = []
    for (const entries of Object.values(res)) {
      for (const [id, fields] of entries) {
        out.push(this.parseMessage<T>(id, fields))
      }
    }
    return out
  }

  async ack(queue: string, msg: QueueMessage): Promise<void> {
    await this.client.send("XACK", [queue, this.cfg.group, msg.id])
    await this.client.send("XDEL", [queue, msg.id])
  }

  async nack(queue: string, msg: QueueMessage, requeue = true): Promise<void> {
    if (requeue) {
      // Leave pending so it can be reclaimed by another consumer via XCLAIM
      return
    }
    // DLQ route: ack original, re-XADD to dlq
    await this.client.send("XACK", [queue, this.cfg.group, msg.id])
    await this.client.send("XDEL", [queue, msg.id])
    const dlq = `${queue}.dlq`
    await this.ensureGroup(dlq)
    await this.client.send("XADD", [
      dlq,
      "*",
      "payload",
      JSON.stringify(msg.payload),
      "idem",
      msg.idempotencyKey,
      "attempts",
      String(msg.attempts),
      "ts",
      String(msg.enqueuedAt),
      "origin",
      queue,
    ])
  }

  async reclaim<T>(queue: string, minIdleMs = 30_000): Promise<QueueMessage<T>[]> {
    await this.ensureGroup(queue)
    const pending = (await this.client.send("XPENDING", [
      queue,
      this.cfg.group,
      "-",
      "+",
      "100",
    ])) as [string, string, number, number][] | null
    if (!pending || pending.length === 0) return []
    const ids = pending.map((p) => p[0])
    const res = (await this.client.send("XCLAIM", [
      queue,
      this.cfg.group,
      this.cfg.consumer,
      String(minIdleMs),
      ...ids,
    ])) as [string, string[]][] | null
    if (!res) return []
    return res.map(([id, fields]) => this.parseMessage<T>(id, fields))
  }

  async depth(queue: string): Promise<number> {
    try {
      const len = (await this.client.send("XLEN", [queue])) as number
      return len
    } catch {
      return 0
    }
  }

  async destroyQueue(queue: string): Promise<void> {
    try {
      await this.client.send("DEL", [queue])
      await this.client.send("DEL", [`${queue}.dlq`])
    } catch {
      // ignore
    }
  }

  async close(): Promise<void> {
    this.client.close()
  }

  capabilities(): QueueCapabilities {
    return { persistent: true, distributed: true, ordered: true, priority: false, dlq: true }
  }

  private parseMessage<T>(id: string, fields: string[]): QueueMessage<T> {
    const map: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
      const k = fields[i]
      const v = fields[i + 1]
      if (k !== undefined && v !== undefined) map[k] = v
    }
    return {
      id,
      payload: JSON.parse(map.payload ?? "null") as T,
      idempotencyKey: map.idem ?? id,
      attempts: Number(map.attempts ?? "0") + 1,
      enqueuedAt: Number(map.ts ?? Date.now()),
    }
  }
}
