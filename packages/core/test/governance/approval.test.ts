import { describe, expect, test } from "bun:test"
import { ApprovalGateSystem } from "../../src/governance/approval.ts"
import {
  ApprovalRequestNotFoundError,
  GateNotRegisteredError,
} from "../../src/governance/errors.ts"

describe("ApprovalGateSystem", () => {
  test("request throws when gate unknown", () => {
    const s = new ApprovalGateSystem()
    expect(() => s.request({ gate: "security", requestedBy: "a", summary: "" })).toThrow(
      GateNotRegisteredError,
    )
  })

  test("request + approve flow fires events", () => {
    const s = new ApprovalGateSystem({
      gates: [{ kind: "architectural", requiredApprovers: ["architect"] }],
    })
    const events: string[] = []
    s.events.on("approval_requested", () => events.push("requested"))
    s.events.on("approval_decided", () => events.push("decided"))
    const req = s.request({
      gate: "architectural",
      requestedBy: "pm",
      summary: "adopt event sourcing",
    })
    const decision = s.approve(req.id, "architect", "lgtm")
    expect(decision.status).toBe("approved")
    expect(events).toEqual(["requested", "decided"])
  })

  test("autoApprove handler fires instantly", () => {
    const s = new ApprovalGateSystem({
      gates: [
        {
          kind: "financial",
          requiredApprovers: ["cfo"],
          autoApprove: (r) => Number(r.metadata?.cost ?? "0") < 100,
        },
      ],
    })
    const req = s.request({
      gate: "financial",
      requestedBy: "pm",
      summary: "$50",
      metadata: { cost: "50" },
    })
    expect(s.decision(req.id)?.status).toBe("approved")
  })

  test("unauthorized approver rejected", () => {
    const s = new ApprovalGateSystem({
      gates: [{ kind: "security", requiredApprovers: ["security"] }],
    })
    const req = s.request({ gate: "security", requestedBy: "a", summary: "x" })
    expect(() => s.approve(req.id, "stranger")).toThrow(/not authorized/i)
  })

  test("override records + mutates decision + audit hook", () => {
    const audited: string[] = []
    const s = new ApprovalGateSystem({
      gates: [{ kind: "release", requiredApprovers: ["sre"] }],
      onAudit: ({ kind }) => audited.push(kind),
    })
    const req = s.request({ gate: "release", requestedBy: "dev", summary: "push" })
    s.override(req.id, "owner", "emergency hotfix")
    expect(s.decision(req.id)?.status).toBe("overridden")
    expect(s.listOverrides()).toHaveLength(1)
    expect(audited).toContain("override")
  })

  test("override requires rationale", () => {
    const s = new ApprovalGateSystem({
      gates: [{ kind: "release", requiredApprovers: ["sre"] }],
    })
    const req = s.request({ gate: "release", requestedBy: "dev", summary: "push" })
    expect(() => s.override(req.id, "owner", "")).toThrow(/rationale required/i)
  })

  test("unknown request id throws", () => {
    const s = new ApprovalGateSystem({
      gates: [{ kind: "security", requiredApprovers: ["sec"] }],
    })
    expect(() => s.approve("missing", "sec")).toThrow(ApprovalRequestNotFoundError)
  })
})
