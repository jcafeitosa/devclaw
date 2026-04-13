import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type AuditEvent, AuditLog } from "../../src/auth/audit.ts"

describe("AuditLog", () => {
  let dir: string
  let log: AuditLog

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-audit-"))
    log = new AuditLog({ dir })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("append writes one NDJSON line per event", async () => {
    await log.append({ event: "auth.save", provider: "anthropic", accountId: "default" })
    await log.append({ event: "auth.delete", provider: "openai", accountId: "work" })
    const content = await readFile(join(dir, "audit.log"), "utf8")
    const lines = content.trim().split("\n")
    expect(lines).toHaveLength(2)
    const a = JSON.parse(lines[0]!) as AuditEvent & { ts: number }
    const b = JSON.parse(lines[1]!) as AuditEvent & { ts: number }
    expect(a.event).toBe("auth.save")
    expect(a.provider).toBe("anthropic")
    expect(b.event).toBe("auth.delete")
  })

  test("each line has numeric ts + correlationId", async () => {
    await log.append({ event: "auth.load", provider: "x", accountId: "default" })
    const content = await readFile(join(dir, "audit.log"), "utf8")
    const line = JSON.parse(content.trim()) as AuditEvent & { ts: number; correlationId: string }
    expect(typeof line.ts).toBe("number")
    expect(line.ts).toBeGreaterThan(0)
    expect(typeof line.correlationId).toBe("string")
    expect(line.correlationId.length).toBeGreaterThan(0)
  })

  test("does not leak token values even when passed in meta by mistake", async () => {
    await log.append({
      event: "auth.refresh.success",
      provider: "anthropic",
      accountId: "default",
      // biome-ignore lint/suspicious/noExplicitAny: mimic callsite passing unknown meta shape
      meta: { accessToken: "LEAKY_TOKEN_XYZ", keep: "ok" } as any,
    })
    const content = await readFile(join(dir, "audit.log"), "utf8")
    expect(content).not.toContain("LEAKY_TOKEN_XYZ")
    expect(content).toContain('"keep":"ok"')
  })

  test("appends across instances (no truncation)", async () => {
    await log.append({ event: "auth.save", provider: "a", accountId: "default" })
    const log2 = new AuditLog({ dir })
    await log2.append({ event: "auth.load", provider: "a", accountId: "default" })
    const content = await readFile(join(dir, "audit.log"), "utf8")
    expect(content.trim().split("\n")).toHaveLength(2)
  })
})
