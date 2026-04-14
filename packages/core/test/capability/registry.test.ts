import { describe, expect, test } from "bun:test"
import {
  CapabilityNotFoundError,
  CapabilityRegistry,
  CapabilityUnavailableError,
} from "../../src/capability/registry.ts"
import type { Capability } from "../../src/capability/types.ts"

function cap(over: Partial<Capability> = {}): Capability {
  return {
    id: "test",
    name: "Test",
    description: "test cap",
    requires: {},
    permission: "auto",
    ...over,
  }
}

describe("CapabilityRegistry", () => {
  test("register + get round-trip", () => {
    const r = new CapabilityRegistry()
    const c = cap({ id: "browse" })
    r.register(c)
    expect(r.get("browse").name).toBe("Test")
  })

  test("get unknown id throws CapabilityNotFoundError", () => {
    const r = new CapabilityRegistry()
    expect(() => r.get("ghost")).toThrow(CapabilityNotFoundError)
  })

  test("isAvailable true when no deps declared", async () => {
    const r = new CapabilityRegistry()
    r.register(cap({ id: "noop" }))
    expect(await r.isAvailable("noop")).toBe(true)
  })

  test("isAvailable false when required runtime missing", async () => {
    const r = new CapabilityRegistry({ hasRuntime: () => false })
    r.register(cap({ id: "exec", requires: { runtimes: ["worktree"] } }))
    expect(await r.isAvailable("exec")).toBe(false)
  })

  test("isAvailable false when required device kind missing", async () => {
    const r = new CapabilityRegistry({ hasDevice: () => false })
    r.register(cap({ id: "gpu_inf", requires: { devices: ["gpu"] } }))
    expect(await r.isAvailable("gpu_inf")).toBe(false)
  })

  test("isAvailable true when all deps satisfied", async () => {
    const r = new CapabilityRegistry({
      hasRuntime: (k) => k === "local",
      hasDevice: (k) => k === "fs",
      hasTool: (k) => k === "read_file",
    })
    r.register(
      cap({
        id: "fs_read",
        requires: { runtimes: ["local"], devices: ["fs"], tools: ["read_file"] },
      }),
    )
    expect(await r.isAvailable("fs_read")).toBe(true)
  })

  test("listAvailable filters by isAvailable", async () => {
    const r = new CapabilityRegistry({ hasRuntime: (k) => k === "local" })
    r.register(cap({ id: "a", requires: { runtimes: ["local"] } }))
    r.register(cap({ id: "b", requires: { runtimes: ["docker"] } }))
    const ids = (await r.listAvailable()).map((c) => c.id).sort()
    expect(ids).toEqual(["a"])
  })

  test("denied permission blocks request even when deps satisfied", async () => {
    const r = new CapabilityRegistry()
    r.register(cap({ id: "x", permission: "denied" }))
    await expect(r.request("x")).rejects.toBeInstanceOf(CapabilityUnavailableError)
  })

  test("auto permission grants immediately", async () => {
    const r = new CapabilityRegistry()
    r.register(cap({ id: "x", permission: "auto" }))
    const grant = await r.request("x")
    expect(grant.granted).toBe(true)
    expect(grant.via).toBe("auto")
  })

  test("prompt permission consults prompter and respects decision", async () => {
    let asked = ""
    const r = new CapabilityRegistry({
      prompt: async (id) => {
        asked = id
        return true
      },
    })
    r.register(cap({ id: "x", permission: "prompt" }))
    const grant = await r.request("x", { reason: "user opt-in" })
    expect(asked).toBe("x")
    expect(grant.granted).toBe(true)
    expect(grant.via).toBe("prompt")
  })

  test("prompt denial throws CapabilityUnavailableError", async () => {
    const r = new CapabilityRegistry({ prompt: async () => false })
    r.register(cap({ id: "x", permission: "prompt" }))
    await expect(r.request("x")).rejects.toBeInstanceOf(CapabilityUnavailableError)
  })

  test("request throws when deps unavailable", async () => {
    const r = new CapabilityRegistry({ hasRuntime: () => false })
    r.register(cap({ id: "x", requires: { runtimes: ["docker"] } }))
    await expect(r.request("x")).rejects.toBeInstanceOf(CapabilityUnavailableError)
  })
})
