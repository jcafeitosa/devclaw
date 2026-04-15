import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { BunRedisStreamsQueue } from "../../src/queue/bun_redis_streams.ts"

const REDIS_URL = process.env.BUN_TEST_REDIS ?? "redis://localhost:6379"

describe("BunRedisStreamsQueue (integration)", () => {
  const queue = `test-queue-${Date.now()}`
  let adapter: BunRedisStreamsQueue

  beforeAll(async () => {
    adapter = new BunRedisStreamsQueue({ url: REDIS_URL, group: "test-group", consumer: "test-1" })
    await adapter.ensureGroup(queue)
  })

  afterAll(async () => {
    await adapter.destroyQueue(queue)
    await adapter.close()
  })

  test("enqueue then dequeue roundtrips payload", async () => {
    const id = await adapter.enqueue(queue, { hello: "world" })
    expect(id).toBeTypeOf("string")
    const msgs = await adapter.dequeue<{ hello: string }>(queue, { count: 1, timeoutMs: 2000 })
    expect(msgs.length).toBe(1)
    expect(msgs[0]!.payload).toEqual({ hello: "world" })
    await adapter.ack(queue, msgs[0]!)
  })

  test("ack removes message; depth goes to 0", async () => {
    await adapter.enqueue(queue, { n: 1 })
    const [msg] = await adapter.dequeue(queue, { count: 1, timeoutMs: 1000 })
    expect(msg).toBeDefined()
    await adapter.ack(queue, msg!)
    expect(await adapter.depth(queue)).toBe(0)
  })

  test("nack with requeue re-XADDs the message to the queue (no reclaim)", async () => {
    await adapter.enqueue(queue, { n: 2 })
    const [m1] = await adapter.dequeue(queue, { count: 1, timeoutMs: 1000 })
    await adapter.nack(queue, m1!, true)
    const reclaimed = await adapter.reclaim(queue, 0)
    // since we re-XADDed, original id should not be present in pending
    expect(reclaimed.some((r) => r.id === m1!.id)).toBe(false)
    // and new message exists in the queue depth
    const depth = await adapter.depth(queue)
    expect(depth).toBeGreaterThanOrEqual(1)
    // drain the new message if present
    const [m2] = await adapter.dequeue(queue, { count: 1, timeoutMs: 1000 })
    if (m2) await adapter.ack(queue, m2)
  })

  test("nack without requeue routes to DLQ", async () => {
    await adapter.enqueue(queue, { n: 3 })
    const [m] = await adapter.dequeue(queue, { count: 1, timeoutMs: 1000 })
    await adapter.nack(queue, m!, false)
    const dlqDepth = await adapter.depth(`${queue}.dlq`)
    expect(dlqDepth).toBeGreaterThanOrEqual(1)
  })
})
