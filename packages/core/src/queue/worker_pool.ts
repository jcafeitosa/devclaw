import type { QueueAdapter, QueueMessage } from "./types.ts"

export type WorkerMode = "embedded" | "sidecar" | "distributed"

export interface RetryConfig {
  maxAttempts: number
  initialDelayMs: number
  backoff: "fixed" | "linear" | "exponential"
}

export interface WorkerPoolConfig<T = unknown> {
  queue: QueueAdapter
  name: string
  handler: (msg: QueueMessage<T>) => Promise<void>
  mode?: WorkerMode
  maxConcurrent?: number
  pollIntervalMs?: number
  retry?: RetryConfig
  onDeadLetter?: (msg: QueueMessage<T>, cause: unknown) => Promise<void>
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoff: "exponential",
}

function computeDelay(retry: RetryConfig, attempt: number): number {
  const base = retry.initialDelayMs
  if (retry.backoff === "fixed") return base
  if (retry.backoff === "linear") return base * attempt
  return base * 2 ** (attempt - 1)
}

export class WorkerPool<T = unknown> {
  readonly mode: WorkerMode
  private running = false
  private inFlight = 0
  private loop: Promise<void> | null = null
  private readonly cfg: Required<Omit<WorkerPoolConfig<T>, "retry" | "onDeadLetter" | "mode">> & {
    retry: RetryConfig
    onDeadLetter?: (msg: QueueMessage<T>, cause: unknown) => Promise<void>
  }

  constructor(cfg: WorkerPoolConfig<T>) {
    this.mode = cfg.mode ?? "embedded"
    this.cfg = {
      queue: cfg.queue,
      name: cfg.name,
      handler: cfg.handler,
      maxConcurrent: cfg.maxConcurrent ?? 1,
      pollIntervalMs: cfg.pollIntervalMs ?? 100,
      retry: cfg.retry ?? DEFAULT_RETRY,
      onDeadLetter: cfg.onDeadLetter,
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.loop = this.runLoop()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.loop) await this.loop
    while (this.inFlight > 0) await Bun.sleep(5)
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      const capacity = this.cfg.maxConcurrent - this.inFlight
      if (capacity <= 0) {
        await Bun.sleep(this.cfg.pollIntervalMs)
        continue
      }
      const msgs = await this.cfg.queue.dequeue<T>(this.cfg.name, {
        count: capacity,
        timeoutMs: this.cfg.pollIntervalMs,
      })
      if (msgs.length === 0) {
        await Bun.sleep(this.cfg.pollIntervalMs)
        continue
      }
      for (const msg of msgs) {
        this.inFlight++
        void this.process(msg).finally(() => {
          this.inFlight--
        })
      }
    }
  }

  private async process(msg: QueueMessage<T>): Promise<void> {
    const { retry, onDeadLetter, queue, name, handler } = this.cfg
    try {
      await handler(msg)
      await queue.ack(name, msg)
      return
    } catch (cause) {
      if (msg.attempts >= retry.maxAttempts) {
        await onDeadLetter?.(msg, cause)
        await queue.nack(name, msg, false)
        return
      }
      const delay = computeDelay(retry, msg.attempts)
      await Bun.sleep(delay)
      await queue.nack(name, msg, true)
    }
  }
}
