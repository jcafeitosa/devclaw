import { describe, expect, test } from "bun:test"

import { InMemoryQueue } from "../../src/queue/in_memory_queue.ts"

describe("InMemoryQueue adapter contract", () => {
  test("exposes adapter kind and can reclaim pending messages", async () => {
    const queue = new InMemoryQueue()
    await queue.enqueue("jobs", { n: 1 })

    const [first] = await queue.dequeue<{ n: number }>("jobs", { count: 1 })
    const reclaimed = await queue.reclaim<{ n: number }>("jobs", 0)

    expect(queue.kind).toBe("memory")
    expect(first?.payload.n).toBe(1)
    expect(reclaimed.map((msg) => msg.id)).toEqual([first?.id ?? ""])
  })
})
