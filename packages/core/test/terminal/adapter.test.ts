import { describe, expect, test } from "bun:test"
import {
  BunPtyAdapter,
  NodePtyAdapter,
  NotImplementedPtyError,
  type PtyAdapter,
  type PtyProcess,
  type PtySpawnOptions,
} from "../../src/terminal/adapter.ts"
import { TerminalSession } from "../../src/terminal/session.ts"

describe("PtyAdapter interface", () => {
  test("BunPtyAdapter reports kind='bun'", () => {
    expect(new BunPtyAdapter().kind).toBe("bun")
  })

  test("BunPtyAdapter spawn runs a command and streams output", async () => {
    const adapter = new BunPtyAdapter()
    const proc = adapter.spawn({ command: ["sh", "-c", "echo hi"] })
    let captured = ""
    proc.onOutput((chunk) => {
      captured += chunk.data
    })
    const code = await new Promise<number>((resolve) =>
      proc.onExit(({ exitCode }) => resolve(exitCode)),
    )
    expect(captured).toContain("hi")
    expect(code).toBe(0)
  })

  test("NodePtyAdapter throws NotImplementedPtyError until node-pty is wired", () => {
    const adapter = new NodePtyAdapter()
    expect(() => adapter.spawn({ command: ["echo"] })).toThrow(NotImplementedPtyError)
  })

  test("TerminalSession uses a custom adapter when provided", async () => {
    const calls: PtySpawnOptions[] = []
    const fake: PtyAdapter = {
      kind: "fake",
      spawn(opts) {
        calls.push(opts)
        let exitCb: ((e: { exitCode: number }) => void) | undefined
        const proc: PtyProcess = {
          onOutput: () => {},
          onExit: (cb) => {
            exitCb = cb
          },
          write: () => {},
          resize: () => {},
          kill: () => {},
        }
        setTimeout(() => exitCb?.({ exitCode: 0 }), 0)
        return proc
      },
    }
    const s = new TerminalSession({ adapter: fake })
    const exit = new Promise<number>((resolve) =>
      s.events.on("exit", ({ exitCode }) => resolve(exitCode)),
    )
    await s.start({ command: ["whatever"], cols: 100, rows: 30 })
    expect(await exit).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.command).toEqual(["whatever"])
    expect(calls[0]!.cols).toBe(100)
    expect(calls[0]!.rows).toBe(30)
  })

  test("TerminalSession.resize propagates to adapter", async () => {
    const resizes: { cols: number; rows: number }[] = []
    const fake: PtyAdapter = {
      kind: "fake",
      spawn() {
        return {
          onOutput: () => {},
          onExit: (cb) => {
            setTimeout(() => cb({ exitCode: 0 }), 5)
          },
          write: () => {},
          resize: (cols, rows) => {
            resizes.push({ cols, rows })
          },
          kill: () => {},
        }
      },
    }
    const s = new TerminalSession({ adapter: fake })
    await s.start({ command: ["x"] })
    s.resize(200, 50)
    expect(resizes).toEqual([{ cols: 200, rows: 50 }])
  })

  test("TerminalSession defaults to BunPtyAdapter", async () => {
    const s = new TerminalSession()
    let captured = ""
    s.events.on("output", ({ data }) => {
      captured += data
    })
    const exit = new Promise<number>((resolve) =>
      s.events.on("exit", ({ exitCode }) => resolve(exitCode)),
    )
    await s.start({ command: ["sh", "-c", "echo default"] })
    await exit
    expect(captured).toContain("default")
  })
})
