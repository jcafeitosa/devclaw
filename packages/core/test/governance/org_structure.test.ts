import { describe, expect, test } from "bun:test"
import { NoOwnerError } from "../../src/governance/errors.ts"
import { OrgStructure } from "../../src/governance/org_structure.ts"

describe("OrgStructure", () => {
  test("addMember + get + list", () => {
    const o = new OrgStructure()
    o.addMember({ id: "w1", role: "worker", managerId: "c1" })
    o.addMember({ id: "c1", role: "coordinator", managerId: "cto" })
    o.addMember({ id: "cto", role: "cto" })
    expect(o.list()).toHaveLength(3)
    expect(o.get("c1")?.role).toBe("coordinator")
  })

  test("assignOwner + ownerOf", () => {
    const o = new OrgStructure()
    o.addMember({ id: "u1", role: "worker" })
    o.assignOwner("task-x", "u1")
    expect(o.ownerOf("task-x")).toBe("u1")
  })

  test("assignOwner with unknown member throws", () => {
    const o = new OrgStructure()
    expect(() => o.assignOwner("task", "ghost")).toThrow(/not in org/)
  })

  test("ownerOf unknown item throws NoOwnerError", () => {
    const o = new OrgStructure()
    expect(() => o.ownerOf("task")).toThrow(NoOwnerError)
  })

  test("chainFor walks management", () => {
    const o = new OrgStructure()
    o.addMember({ id: "ceo", role: "ceo" })
    o.addMember({ id: "cto", role: "cto", managerId: "ceo" })
    o.addMember({ id: "c1", role: "coordinator", managerId: "cto" })
    o.addMember({ id: "w1", role: "worker", managerId: "c1" })
    const chain = o.chainFor("w1").map((m) => m.id)
    expect(chain).toEqual(["w1", "c1", "cto", "ceo"])
  })

  test("escalate follows Worker → Coord → CTO → CEO → human", () => {
    const o = new OrgStructure()
    expect(o.escalate("worker")).toBe("specialist")
    expect(o.escalate("specialist")).toBe("coordinator")
    expect(o.escalate("coordinator")).toBe("cto")
    expect(o.escalate("cto")).toBe("ceo")
    expect(o.escalate("ceo")).toBe("human")
    expect(o.escalate("cfo")).toBe("ceo")
  })
})
