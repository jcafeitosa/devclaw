import { describe, expect, test } from "bun:test"
import type { QueueMessage } from "../../src/adapter/queue"
import { BunRedisStreamsQueue } from "../../src/queue/bun_redis_streams"

describe("BunRedisStreamsQueue.nack re-XADD", () => {
  test("requeue true ack/del and XADD to same queue with attempts preserved", async () => {
    const calls: { cmd: string; args: string[] }[] = []
    const fakeClient = {
      send: async (cmd: string, args: string[]) => {
        calls.push({ cmd, args })
        if (cmd === "XADD") return "1-0"
        if (cmd === "XACK" || cmd === "XDEL") return 1
        return null
      },
    }

    const q = new BunRedisStreamsQueue({ url: "fake", group: "g", consumer: "c" })
    // inject fake client (private field)
    ;(q as unknown as { client: typeof fakeClient }).client = fakeClient

    const msg: QueueMessage<{ foo: string }> = {
      id: "1-0",
      payload: { foo: "bar" },
      idempotencyKey: "idem-1",
      attempts: 1,
      enqueuedAt: Date.now(),
    }

    await q.nack("myqueue", msg, true)

    // Expect sequence: XACK, XDEL, XADD
    expect(calls.length).toBe(3)
    expect(calls[0]!.cmd).toBe("XACK")
    expect(calls[1]!.cmd).toBe("XDEL")
    expect(calls[2]!.cmd).toBe("XADD")

    // Verify XADD args include payload and attempts preserved
    expect(calls[2]!.args[0]).toBe("myqueue")
    const payloadIndex = calls[2]!.args.indexOf("payload")
    expect(payloadIndex).not.toBe(-1)
    expect(calls[2]!.args[payloadIndex + 1]).toBe(JSON.stringify(msg.payload))
    const attemptsIndex = calls[2]!.args.indexOf("attempts")
    expect(attemptsIndex).not.toBe(-1)
    expect(calls[2]!.args[attemptsIndex + 1]).toBe(String(msg.attempts))
  })
})
