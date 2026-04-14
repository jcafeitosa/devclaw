import { describe, expect, test } from "bun:test"
import { ChannelRegistry } from "../../src/comm/channel.ts"
import { AccessDeniedError, NotFoundError } from "../../src/comm/errors.ts"

describe("ChannelRegistry", () => {
  test("create + get + list", () => {
    const r = new ChannelRegistry()
    const c = r.create({ name: "deploy", type: "system", members: ["sre"] })
    expect(r.get(c.id).name).toBe("deploy")
    expect(r.list()).toHaveLength(1)
  })

  test("join + leave mutates members", () => {
    const r = new ChannelRegistry()
    const c = r.create({ name: "x", type: "agent" })
    r.join(c.id, "a")
    r.join(c.id, "b")
    r.leave(c.id, "a")
    expect(r.get(c.id).members).toEqual(["b"])
  })

  test("get unknown throws NotFoundError", () => {
    const r = new ChannelRegistry()
    expect(() => r.get("missing")).toThrow(NotFoundError)
  })

  test("post denied for non-member unless public or explicitly allowed", () => {
    const r = new ChannelRegistry()
    const c = r.create({ name: "x", type: "agent" })
    expect(() => r.post(c.id, "stranger", "hi")).toThrow(AccessDeniedError)
    r.join(c.id, "stranger")
    expect(r.post(c.id, "stranger", "hi").content).toBe("hi")
  })

  test("publicWrite allows anyone to post", () => {
    const r = new ChannelRegistry()
    const c = r.create({ name: "x", type: "hybrid", policy: { publicWrite: true } })
    expect(r.post(c.id, "anyone", "hello").from).toBe("anyone")
  })

  test("list_messages denied for non-reader", () => {
    const r = new ChannelRegistry()
    const c = r.create({ name: "x", type: "human", members: ["a"] })
    r.post(c.id, "a", "hi")
    expect(() => r.list_messages(c.id, "stranger")).toThrow(AccessDeniedError)
    expect(r.list_messages(c.id, "a")).toHaveLength(1)
  })

  test("subscribe delivers live messages + unsubscribe stops", () => {
    const r = new ChannelRegistry()
    const c = r.create({ name: "x", type: "agent", members: ["s"] })
    const received: string[] = []
    const off = r.subscribe(c.id, "s", (m) => received.push(m.content))
    r.join(c.id, "s")
    r.post(c.id, "s", "one")
    off()
    r.post(c.id, "s", "two")
    expect(received).toEqual(["one"])
  })

  test("subscribe denied when reader has no access", () => {
    const r = new ChannelRegistry()
    const c = r.create({ name: "x", type: "system" })
    expect(() => r.subscribe(c.id, "stranger", () => {})).toThrow(AccessDeniedError)
  })
})
