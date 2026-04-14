import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AuditLog } from "../../src/auth/audit.ts"
import { GateBlockedError } from "../../src/hook/errors.ts"
import { GateManager } from "../../src/hook/gate.ts"

describe("GateManager", () => {
  let dir: string
  let audit: AuditLog

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-gate-"))
    audit = new AuditLog({ dir })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("passes when all checks ok", async () => {
    const m = new GateManager({
      checks: {
        "pre-design": [async () => ({ ok: true })],
      },
      audit,
    })
    await expect(m.ensure({ gate: "pre-design", actor: "a" })).resolves.toBeUndefined()
    const content = await readFile(join(dir, "audit.log"), "utf8")
    expect(content).toContain("gate.pre-design")
  })

  test("blocks when any check fails + throws GateBlockedError", async () => {
    const m = new GateManager({
      checks: {
        "pre-production-code": [
          async () => ({ ok: false, reasons: ["no failing test"] }),
          async () => ({ ok: true }),
        ],
      },
      audit,
    })
    await expect(m.ensure({ gate: "pre-production-code", actor: "a" })).rejects.toBeInstanceOf(
      GateBlockedError,
    )
    const content = await readFile(join(dir, "audit.log"), "utf8")
    expect(content).toContain("blocked")
    expect(content).toContain("no failing test")
  })

  test("override consumes one ensure with audit", async () => {
    const m = new GateManager({
      checks: {
        "pre-merge": [async () => ({ ok: false, reasons: ["review not done"] })],
      },
      audit,
    })
    m.override("pre-merge", "human", "emergency hotfix", "feat/foo")
    await m.ensure({ gate: "pre-merge", actor: "human", scope: "feat/foo" })
    const content = await readFile(join(dir, "audit.log"), "utf8")
    expect(content).toContain("overridden")
    expect(content).toContain("emergency hotfix")
    // Subsequent ensure without re-override → blocks again
    await expect(
      m.ensure({ gate: "pre-merge", actor: "human", scope: "feat/foo" }),
    ).rejects.toBeInstanceOf(GateBlockedError)
  })

  test("addCheck extends gate", async () => {
    const m = new GateManager({ audit })
    m.addCheck("pre-completion", async () => ({ ok: false, reasons: ["no tests"] }))
    await expect(m.ensure({ gate: "pre-completion", actor: "a" })).rejects.toBeInstanceOf(
      GateBlockedError,
    )
  })

  test("empty gate passes by default", async () => {
    const m = new GateManager({ audit })
    await expect(m.ensure({ gate: "pre-implementation", actor: "a" })).resolves.toBeUndefined()
  })
})
