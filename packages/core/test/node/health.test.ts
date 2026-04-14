import { describe, expect, test } from "bun:test"
import { HealthMonitor } from "../../src/node/health.ts"
import { NodeRegistry } from "../../src/node/registry.ts"

describe("HealthMonitor", () => {
  test("marks node online when probe succeeds", async () => {
    const reg = new NodeRegistry()
    reg.register({
      id: "a",
      name: "a",
      kind: "remote",
      endpoint: "ws://x",
      capabilities: [],
      status: "unknown",
    })
    const mon = new HealthMonitor(reg, { probe: async () => true })
    await mon.checkAll()
    expect(reg.get("a").status).toBe("online")
  })

  test("marks node offline after consecutive probe failures", async () => {
    const reg = new NodeRegistry()
    reg.register({
      id: "a",
      name: "a",
      kind: "remote",
      endpoint: "ws://x",
      capabilities: [],
      status: "online",
    })
    const mon = new HealthMonitor(reg, { probe: async () => false, failureThreshold: 2 })
    await mon.checkAll()
    expect(reg.get("a").status).toBe("degraded")
    await mon.checkAll()
    expect(reg.get("a").status).toBe("offline")
  })

  test("recovery resets failure counter", async () => {
    const reg = new NodeRegistry()
    reg.register({
      id: "a",
      name: "a",
      kind: "remote",
      endpoint: "ws://x",
      capabilities: [],
      status: "online",
    })
    let healthy = false
    const mon = new HealthMonitor(reg, {
      probe: async () => healthy,
      failureThreshold: 2,
    })
    await mon.checkAll()
    expect(reg.get("a").status).toBe("degraded")
    healthy = true
    await mon.checkAll()
    expect(reg.get("a").status).toBe("online")
  })

  test("local nodes are skipped (always online)", async () => {
    const reg = new NodeRegistry()
    reg.register({
      id: "loc",
      name: "loc",
      kind: "local",
      capabilities: [],
      status: "unknown",
    })
    const mon = new HealthMonitor(reg, { probe: async () => false })
    await mon.checkAll()
    expect(reg.get("loc").status).toBe("online")
  })
})
