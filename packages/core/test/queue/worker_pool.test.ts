import { describe, expect, test } from "bun:test"
import { InMemoryQueue } from "../../src/queue/in_memory_queue.ts"
import type { QueueMessage } from "../../src/queue/types.ts"
import { WorkerPool } from "../../src/queue/worker_pool.ts"

const Q = "test.jobs"

function tick(ms = 5) {
  return Bun.sleep(ms)
}

describe("WorkerPool (embedded)", () => {
  test("consumes and processes enqueued message", async () => {
    const queue = new InMemoryQueue()
    const seen: number[] = []
    const pool = new WorkerPool({
      queue,
      name: Q,
      handler: async (msg: QueueMessage<{ n: number }>) => {
        seen.push(msg.payload.n)
      },
      mode: "embedded",
      maxConcurrent: 2,
      pollIntervalMs: 5,
    })
    await queue.enqueue(Q, { n: 1 })
    await queue.enqueue(Q, { n: 2 })
    pool.start()
    await tick(50)
    await pool.stop()
    expect(seen.sort()).toEqual([1, 2])
  })

  test("retries failed handler with exponential backoff, then DLQs", async () => {
    const queue = new InMemoryQueue()
    const dlq: QueueMessage[] = []
    let attempts = 0
    const pool = new WorkerPool({
      queue,
      name: Q,
      handler: async () => {
        attempts++
        throw new Error("boom")
      },
      mode: "embedded",
      maxConcurrent: 1,
      pollIntervalMs: 5,
      retry: { maxAttempts: 3, initialDelayMs: 5, backoff: "exponential" },
      onDeadLetter: async (msg) => {
        dlq.push(msg)
      },
    })
    await queue.enqueue(Q, { n: 99 })
    pool.start()
    await tick(200)
    await pool.stop()
    expect(attempts).toBe(3)
    expect(dlq.length).toBe(1)
    expect((dlq[0] as QueueMessage<{ n: number }>).payload.n).toBe(99)
  })

  test("respects maxConcurrent", async () => {
    const queue = new InMemoryQueue()
    let inFlight = 0
    let peak = 0
    const pool = new WorkerPool({
      queue,
      name: Q,
      handler: async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await tick(20)
        inFlight--
      },
      mode: "embedded",
      maxConcurrent: 2,
      pollIntervalMs: 5,
    })
    for (let i = 0; i < 6; i++) await queue.enqueue(Q, { i })
    pool.start()
    await tick(200)
    await pool.stop()
    expect(peak).toBeLessThanOrEqual(2)
  })

  test("stop() drains in-flight handlers gracefully", async () => {
    const queue = new InMemoryQueue()
    let completed = 0
    const pool = new WorkerPool({
      queue,
      name: Q,
      handler: async () => {
        await tick(30)
        completed++
      },
      mode: "embedded",
      maxConcurrent: 2,
      pollIntervalMs: 5,
    })
    await queue.enqueue(Q, { n: 1 })
    await queue.enqueue(Q, { n: 2 })
    pool.start()
    await tick(10)
    await pool.stop()
    expect(completed).toBe(2)
  })
})
