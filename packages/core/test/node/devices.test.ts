import { describe, expect, test } from "bun:test"
import { DeviceNotFoundError, DeviceRegistry } from "../../src/node/devices.ts"

describe("DeviceRegistry", () => {
  test("registers and retrieves devices", () => {
    const r = new DeviceRegistry()
    r.register({ id: "gpu0", nodeId: "a", kind: "gpu", attributes: { vram: "24GB" } })
    expect(r.get("gpu0").attributes.vram).toBe("24GB")
  })

  test("findByNode returns devices on that node", () => {
    const r = new DeviceRegistry()
    r.register({ id: "gpu0", nodeId: "a", kind: "gpu", attributes: {} })
    r.register({ id: "tty0", nodeId: "a", kind: "terminal", attributes: {} })
    r.register({ id: "tty1", nodeId: "b", kind: "terminal", attributes: {} })
    expect(r.findByNode("a")).toHaveLength(2)
  })

  test("findByKind filters by device kind", () => {
    const r = new DeviceRegistry()
    r.register({ id: "tty0", nodeId: "a", kind: "terminal", attributes: {} })
    r.register({ id: "tty1", nodeId: "b", kind: "terminal", attributes: {} })
    r.register({ id: "gpu0", nodeId: "a", kind: "gpu", attributes: {} })
    expect(r.findByKind("terminal")).toHaveLength(2)
  })

  test("get throws DeviceNotFoundError for unknown id", () => {
    const r = new DeviceRegistry()
    expect(() => r.get("ghost")).toThrow(DeviceNotFoundError)
  })

  test("unregisterByNode drops all devices for a node", () => {
    const r = new DeviceRegistry()
    r.register({ id: "gpu0", nodeId: "a", kind: "gpu", attributes: {} })
    r.register({ id: "tty0", nodeId: "a", kind: "terminal", attributes: {} })
    r.register({ id: "tty1", nodeId: "b", kind: "terminal", attributes: {} })
    r.unregisterByNode("a")
    expect(r.list().map((d) => d.id)).toEqual(["tty1"])
  })
})
