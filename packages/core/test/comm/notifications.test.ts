import { describe, expect, test } from "bun:test"
import { DeliveryFailedError } from "../../src/comm/errors.ts"
import { NotificationCenter } from "../../src/comm/notifications.ts"

describe("NotificationCenter", () => {
  test("default in-app delivery appears in recipient inbox", async () => {
    const c = new NotificationCenter()
    await c.emit({
      type: "mention",
      to: "alice",
      title: "pinged",
      body: "@alice look here",
    })
    const inbox = c.inbox("alice")
    expect(inbox).toHaveLength(1)
    expect(inbox[0]?.title).toBe("pinged")
  })

  test("multi-channel delivery aggregates results", async () => {
    const c = new NotificationCenter({
      dispatchers: {
        slack: () => Promise.resolve(),
        email: () => Promise.resolve(),
      },
      defaultDelivery: ["in-app", "slack", "email"],
    })
    const { delivered } = await c.emit({
      type: "approval",
      to: "bob",
      title: "approve pls",
      body: "...",
    })
    expect(delivered.map((d) => d.channel).sort()).toEqual(["email", "in-app", "slack"])
    expect(delivered.every((d) => d.delivered)).toBe(true)
  })

  test("partial delivery: succeeded channels recorded, failures returned", async () => {
    const c = new NotificationCenter({
      dispatchers: {
        slack: () => {
          throw new Error("slack down")
        },
      },
      defaultDelivery: ["in-app", "slack"],
    })
    const { delivered, notification } = await c.emit({
      type: "blocker",
      to: "a",
      title: "t",
      body: "b",
    })
    expect(delivered.find((d) => d.channel === "slack")?.delivered).toBe(false)
    expect(delivered.find((d) => d.channel === "in-app")?.delivered).toBe(true)
    expect(notification.deliveredTo).toContain("in-app")
  })

  test("all-failed → DeliveryFailedError", async () => {
    const c = new NotificationCenter({
      dispatchers: {
        only: () => {
          throw new Error("down")
        },
      },
      defaultDelivery: ["only"],
    })
    await expect(
      c.emit({ type: "incident", to: "oncall", title: "sev1", body: "prod down" }),
    ).rejects.toBeInstanceOf(DeliveryFailedError)
  })

  test("priority routing overrides default delivery", async () => {
    const urgentCalls: string[] = []
    const c = new NotificationCenter({
      dispatchers: {
        "in-app": () => {},
        pager: () => {
          urgentCalls.push("pager")
        },
      },
      priorityRouting: { urgent: ["pager"] },
    })
    await c.emit({
      type: "incident",
      to: "oncall",
      title: "x",
      body: "y",
    })
    expect(urgentCalls).toEqual(["pager"])
  })

  test("inbox only shows notifications addressed to recipient", async () => {
    const c = new NotificationCenter()
    await c.emit({ type: "mention", to: "a", title: "t", body: "b" })
    await c.emit({ type: "mention", to: "b", title: "t", body: "b" })
    expect(c.inbox("a")).toHaveLength(1)
  })
})
