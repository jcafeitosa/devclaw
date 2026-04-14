import { describe, expect, test } from "bun:test"
import type { TerminalAuditEvent } from "../../src/terminal/audit.ts"
import { DEFAULT_REDACTION_PATTERNS, redactOutput } from "../../src/terminal/redaction.ts"
import { TerminalPermissionDeniedError, TerminalSession } from "../../src/terminal/session.ts"

async function waitExit(s: TerminalSession): Promise<number> {
  return new Promise((resolve) => s.events.on("exit", ({ exitCode }) => resolve(exitCode)))
}

describe("terminal security — permission gate", () => {
  test("start without approver throws (default deny)", async () => {
    const s = new TerminalSession({ requireApproval: true })
    await expect(s.start({ command: ["true"] })).rejects.toBeInstanceOf(
      TerminalPermissionDeniedError,
    )
  })

  test("approver denial throws and does not spawn", async () => {
    const s = new TerminalSession({
      requireApproval: true,
      approver: async () => ({ allow: false, reason: "policy" }),
    })
    await expect(s.start({ command: ["true"] })).rejects.toBeInstanceOf(
      TerminalPermissionDeniedError,
    )
  })

  test("approver grant allows execution", async () => {
    const s = new TerminalSession({
      requireApproval: true,
      approver: async () => ({ allow: true }),
    })
    const exit = waitExit(s)
    await s.start({ command: ["sh", "-c", "exit 0"] })
    expect(await exit).toBe(0)
  })

  test("approver receives command + cwd + reason", async () => {
    let seen: { command: string[]; cwd?: string; reason?: string } | undefined
    const s = new TerminalSession({
      requireApproval: true,
      approver: async (req) => {
        seen = { command: req.command, cwd: req.cwd, reason: req.reason }
        return { allow: true }
      },
    })
    const exit = waitExit(s)
    await s.start({ command: ["true"], cwd: "/tmp", reason: "install deps" })
    await exit
    expect(seen?.command).toEqual(["true"])
    expect(seen?.reason).toBe("install deps")
  })
})

describe("terminal security — audit log", () => {
  test("emits audit events for start, write, exit", async () => {
    const events: TerminalAuditEvent[] = []
    const s = new TerminalSession({ audit: (e) => events.push(e) })
    const exit = waitExit(s)
    await s.start({ command: ["cat"] })
    await s.write("hi\n")
    await s.closeStdin()
    await exit
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain("start")
    expect(kinds).toContain("write")
    expect(kinds).toContain("exit")
  })

  test("write audit records byte length, not content", async () => {
    const events: TerminalAuditEvent[] = []
    const s = new TerminalSession({ audit: (e) => events.push(e) })
    const exit = waitExit(s)
    await s.start({ command: ["cat"] })
    await s.write("secret-token-abc")
    await s.closeStdin()
    await exit
    const write = events.find((e) => e.kind === "write")
    expect(write).toBeDefined()
    expect((write as { bytes: number }).bytes).toBe("secret-token-abc".length)
    expect(JSON.stringify(write)).not.toContain("secret-token-abc")
  })

  test("exit audit records exit code and duration", async () => {
    const events: TerminalAuditEvent[] = []
    const s = new TerminalSession({ audit: (e) => events.push(e) })
    const exit = waitExit(s)
    await s.start({ command: ["sh", "-c", "exit 3"] })
    await exit
    const ev = events.find((e) => e.kind === "exit") as
      | { kind: "exit"; exitCode: number; durationMs: number }
      | undefined
    expect(ev?.exitCode).toBe(3)
    expect(ev?.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe("terminal security — redaction", () => {
  test("redactOutput scrubs long API-key-like tokens", () => {
    const out = redactOutput("key=sk-abcdef0123456789abcdef0123456789abcdef0123")
    expect(out).toContain("[REDACTED")
    expect(out).not.toContain("abcdef0123456789abcdef0123456789abcdef0123")
  })

  test("redactOutput scrubs AWS access keys", () => {
    const out = redactOutput("aws AKIAIOSFODNN7EXAMPLE found")
    expect(out).toContain("[REDACTED:aws_access_key]")
  })

  test("redactOutput scrubs credit-card-like 16 digit runs", () => {
    const out = redactOutput("card 4111 1111 1111 1111 end")
    expect(out).toContain("[REDACTED:credit_card]")
  })

  test("custom patterns compose with defaults", () => {
    const out = redactOutput("TOKEN:HUNTER2 suffix", [
      ...DEFAULT_REDACTION_PATTERNS,
      { name: "hunter", pattern: /HUNTER2/g },
    ])
    expect(out).toContain("[REDACTED:hunter]")
  })

  test("session output event receives redacted data when redaction enabled", async () => {
    let captured = ""
    const s = new TerminalSession({ redact: true })
    s.events.on("output", ({ data }) => {
      captured += data
    })
    const exit = waitExit(s)
    await s.start({
      command: ["sh", "-c", "echo AKIAIOSFODNN7EXAMPLE"],
    })
    await exit
    expect(captured).toContain("[REDACTED:aws_access_key]")
    expect(captured).not.toContain("AKIAIOSFODNN7EXAMPLE")
  })

  test("redaction off by default", async () => {
    let captured = ""
    const s = new TerminalSession()
    s.events.on("output", ({ data }) => {
      captured += data
    })
    const exit = waitExit(s)
    await s.start({ command: ["sh", "-c", "echo AKIAIOSFODNN7EXAMPLE"] })
    await exit
    expect(captured).toContain("AKIAIOSFODNN7EXAMPLE")
  })
})
