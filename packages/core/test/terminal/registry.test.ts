import { describe, expect, test } from "bun:test"
import { TerminalNotFoundError, TerminalRegistry } from "../../src/terminal/registry.ts"
import { TerminalSession } from "../../src/terminal/session.ts"

describe("TerminalRegistry", () => {
  test("creates sessions with auto-generated ids", async () => {
    const reg = new TerminalRegistry()
    const id = await reg.create({ command: ["sh", "-c", "echo hi"] })
    expect(id).toMatch(/^term_/)
    const s = reg.get(id)
    expect(s).toBeInstanceOf(TerminalSession)
    await new Promise<void>((resolve) => s.events.on("exit", () => resolve()))
  })

  test("get throws TerminalNotFoundError for unknown id", () => {
    const reg = new TerminalRegistry()
    expect(() => reg.get("ghost")).toThrow(TerminalNotFoundError)
  })

  test("close kills session and removes from registry", async () => {
    const reg = new TerminalRegistry()
    const id = await reg.create({ command: ["sh", "-c", "sleep 10"] })
    await reg.close(id)
    expect(() => reg.get(id)).toThrow(TerminalNotFoundError)
  })

  test("list returns active session ids", async () => {
    const reg = new TerminalRegistry()
    const a = await reg.create({ command: ["sh", "-c", "sleep 10"] })
    const b = await reg.create({ command: ["sh", "-c", "sleep 10"] })
    expect(reg.list().sort()).toEqual([a, b].sort())
    await reg.close(a)
    await reg.close(b)
  })

  test("session auto-removes from registry on exit", async () => {
    const reg = new TerminalRegistry()
    const id = await reg.create({ command: ["sh", "-c", "exit 0"] })
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (!reg.list().includes(id)) {
          clearInterval(poll)
          resolve()
        }
      }, 10)
    })
    expect(reg.list()).not.toContain(id)
  })
})
