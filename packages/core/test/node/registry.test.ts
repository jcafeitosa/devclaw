import { describe, expect, test } from "bun:test"
import { DuplicateNodeError, NodeNotFoundError, NodeRegistry } from "../../src/node/registry.ts"

function fakeNode(id: string, capabilities: string[] = []) {
  return { id, name: id, kind: "local" as const, capabilities, status: "online" as const }
}

describe("NodeRegistry", () => {
  test("registers and retrieves nodes", () => {
    const r = new NodeRegistry()
    const n = fakeNode("a", ["shell"])
    r.register(n)
    expect(r.get("a")).toEqual(n)
  })

  test("duplicate registration throws", () => {
    const r = new NodeRegistry()
    r.register(fakeNode("a"))
    expect(() => r.register(fakeNode("a"))).toThrow(DuplicateNodeError)
  })

  test("unknown id throws NodeNotFoundError", () => {
    const r = new NodeRegistry()
    expect(() => r.get("ghost")).toThrow(NodeNotFoundError)
  })

  test("list returns all nodes", () => {
    const r = new NodeRegistry()
    r.register(fakeNode("a"))
    r.register(fakeNode("b"))
    expect(r.list()).toHaveLength(2)
  })

  test("findByCapability returns only nodes with capability", () => {
    const r = new NodeRegistry()
    r.register(fakeNode("a", ["shell", "fs"]))
    r.register(fakeNode("b", ["shell"]))
    r.register(fakeNode("c", ["gpu"]))
    const matches = r
      .findByCapability("shell")
      .map((n) => n.id)
      .sort()
    expect(matches).toEqual(["a", "b"])
  })

  test("findByCapability filters out offline nodes by default", () => {
    const r = new NodeRegistry()
    r.register({ ...fakeNode("a", ["shell"]), status: "offline" })
    r.register(fakeNode("b", ["shell"]))
    expect(r.findByCapability("shell").map((n) => n.id)).toEqual(["b"])
  })

  test("setStatus updates node status", () => {
    const r = new NodeRegistry()
    r.register(fakeNode("a"))
    r.setStatus("a", "degraded")
    expect(r.get("a").status).toBe("degraded")
  })

  test("unregister removes node", () => {
    const r = new NodeRegistry()
    r.register(fakeNode("a"))
    r.unregister("a")
    expect(r.list()).toHaveLength(0)
  })
})
