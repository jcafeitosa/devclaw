import { describe, expect, test } from "bun:test"
import { ChannelRegistry } from "../../src/comm/channel.ts"
import { AgentCommRouter } from "../../src/comm/router.ts"
import type { CommEvent } from "../../src/comm/types.ts"

describe("AgentCommRouter", () => {
  test("direct delivers only to target", () => {
    const r = new AgentCommRouter()
    const received: CommEvent[] = []
    r.onDirect("bob", (e) => received.push(e))
    const other: CommEvent[] = []
    r.onDirect("alice", (e) => other.push(e))
    r.send({ mode: "direct", from: "pm", to: "bob", payload: { hi: true } })
    expect(received).toHaveLength(1)
    expect(other).toHaveLength(0)
  })

  test("broadcast reaches all broadcast listeners", () => {
    const r = new AgentCommRouter()
    let count = 0
    r.onBroadcast(() => {
      count++
    })
    r.onBroadcast(() => {
      count++
    })
    r.send({ mode: "broadcast", from: "coord", payload: { status: "go" } })
    expect(count).toBe(2)
  })

  test("topic event delivered only to topic subscribers", () => {
    const r = new AgentCommRouter()
    const deploy: CommEvent[] = []
    const security: CommEvent[] = []
    r.onTopic("deploy", (e) => deploy.push(e))
    r.onTopic("security", (e) => security.push(e))
    r.send({ mode: "event", from: "sre", topic: "deploy", payload: { v: 1 } })
    expect(deploy).toHaveLength(1)
    expect(security).toHaveLength(0)
  })

  test("channel mode posts through ChannelRegistry", () => {
    const channels = new ChannelRegistry()
    const c = channels.create({ name: "x", type: "agent", members: ["backend"] })
    const router = new AgentCommRouter({ channels })
    const event = router.send({
      mode: "channel",
      from: "backend",
      channelId: c.id,
      content: "hello",
    })
    expect(event.mode).toBe("channel")
    expect(channels.list_messages(c.id, "backend")).toHaveLength(1)
  })

  test("channel mode without registry throws", () => {
    const router = new AgentCommRouter()
    expect(() =>
      router.send({
        mode: "channel",
        from: "a",
        channelId: "c",
        content: "x",
      }),
    ).toThrow(/requires a ChannelRegistry/)
  })

  test("unsubscribe stops delivery", () => {
    const r = new AgentCommRouter()
    let count = 0
    const off = r.onDirect("a", () => {
      count++
    })
    r.send({ mode: "direct", from: "x", to: "a", payload: null })
    off()
    r.send({ mode: "direct", from: "x", to: "a", payload: null })
    expect(count).toBe(1)
  })
})
