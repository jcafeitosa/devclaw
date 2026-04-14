import { describe, expect, test } from "bun:test"
import { TerminalSession } from "../../src/terminal/session.ts"

describe("TerminalSession", () => {
  test("spawns, echoes stdin to stdout via cat, exits cleanly", async () => {
    const s = new TerminalSession()
    let captured = ""
    s.events.on("output", ({ data }) => {
      captured += data
    })
    const exit = new Promise<number>((resolve) => {
      s.events.on("exit", ({ exitCode }) => resolve(exitCode))
    })
    await s.start({ command: ["cat"] })
    await s.write("hello\n")
    await s.closeStdin()
    const code = await exit
    expect(captured).toContain("hello")
    expect(code).toBe(0)
  })

  test("kill terminates running process", async () => {
    const s = new TerminalSession()
    const exit = new Promise<number>((resolve) => {
      s.events.on("exit", ({ exitCode }) => resolve(exitCode))
    })
    await s.start({ command: ["sh", "-c", "sleep 10"] })
    s.kill()
    const code = await exit
    expect(code).not.toBe(0)
  })

  test("start twice throws", async () => {
    const s = new TerminalSession()
    await s.start({ command: ["cat"] })
    await expect(s.start({ command: ["cat"] })).rejects.toThrow()
    s.kill()
  })

  test("stderr is captured via output event with stream='stderr'", async () => {
    const s = new TerminalSession()
    let stderrChunks = ""
    s.events.on("output", ({ data, stream }) => {
      if (stream === "stderr") stderrChunks += data
    })
    const exit = new Promise<number>((resolve) => {
      s.events.on("exit", ({ exitCode }) => resolve(exitCode))
    })
    await s.start({ command: ["sh", "-c", "echo oops 1>&2"] })
    await exit
    expect(stderrChunks).toContain("oops")
  })

  test("size getter returns last known dimensions", async () => {
    const s = new TerminalSession()
    await s.start({ command: ["cat"], cols: 120, rows: 40 })
    expect(s.size()).toEqual({ cols: 120, rows: 40 })
    s.resize(100, 30)
    expect(s.size()).toEqual({ cols: 100, rows: 30 })
    s.kill()
  })
})
