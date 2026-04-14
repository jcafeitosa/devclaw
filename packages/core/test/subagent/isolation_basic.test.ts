import { describe, expect, test } from "bun:test"
import { readdir, stat } from "node:fs/promises"
import { ForkIsolation } from "../../src/subagent/isolation/fork.ts"
import { NoneIsolation } from "../../src/subagent/isolation/none.ts"

describe("NoneIsolation", () => {
  test("allocate returns cwd + no-op cleanup", async () => {
    const n = new NoneIsolation()
    const alloc = await n.allocate({ subagentId: "s", cwd: "/tmp" })
    expect(alloc.workdir).toBe("/tmp")
    await alloc.cleanup()
  })

  test("defaults to process.cwd when no cwd", async () => {
    const n = new NoneIsolation()
    const alloc = await n.allocate({ subagentId: "s" })
    expect(alloc.workdir).toBe(process.cwd())
  })
})

describe("ForkIsolation", () => {
  test("allocate creates tmp dir + cleanup removes it", async () => {
    const f = new ForkIsolation()
    const alloc = await f.allocate({ subagentId: "s1" })
    const st = await stat(alloc.workdir)
    expect(st.isDirectory()).toBe(true)
    await alloc.cleanup()
    await expect(readdir(alloc.workdir)).rejects.toThrow()
  })

  test("env flows through", async () => {
    const f = new ForkIsolation({ env: { FOO: "bar" } })
    const alloc = await f.allocate({ subagentId: "s2" })
    expect(alloc.env?.FOO).toBe("bar")
    await alloc.cleanup()
  })
})
