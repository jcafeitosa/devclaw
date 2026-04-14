import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ConsoleAuditSink,
  JsonlFileAuditSink,
  MemoryAuditSink,
  MultiAuditSink,
  verifyChain,
} from "../../src/audit/sink.ts"
import type { AuditEvent } from "../../src/audit/types.ts"

function ev(over: Partial<AuditEvent> = {}): Omit<AuditEvent, "at" | "id" | "prevHash" | "hash"> {
  return {
    source: "test",
    kind: "noop",
    severity: "info",
    attrs: {},
    ...over,
  }
}

describe("MemoryAuditSink — record + query", () => {
  test("record assigns id, at, hash, prevHash linking", async () => {
    let now = 1000
    const sink = new MemoryAuditSink({ now: () => now })
    await sink.record(ev({ kind: "a" }))
    now = 1001
    await sink.record(ev({ kind: "b" }))
    const all = sink.list()
    expect(all).toHaveLength(2)
    expect(all[0]!.id).toBeDefined()
    expect(all[0]!.at).toBe(1000)
    expect(all[0]!.hash).toBeDefined()
    expect(all[1]!.prevHash).toBe(all[0]!.hash)
  })

  test("query filters by source, kind, severity, time range", async () => {
    const sink = new MemoryAuditSink()
    await sink.record(ev({ source: "terminal", kind: "start", severity: "info" }))
    await sink.record(ev({ source: "mcp", kind: "tool_call", severity: "info" }))
    await sink.record(ev({ source: "terminal", kind: "denied", severity: "warn" }))
    expect(sink.query({ source: "terminal" }).length).toBe(2)
    expect(sink.query({ kind: "tool_call" }).length).toBe(1)
    expect(sink.query({ severity: "warn" }).length).toBe(1)
  })
})

describe("verifyChain — tamper detection", () => {
  test("untampered chain validates", async () => {
    const sink = new MemoryAuditSink()
    await sink.record(ev())
    await sink.record(ev())
    await sink.record(ev())
    const result = verifyChain(sink.list())
    expect(result.valid).toBe(true)
  })

  test("modifying an event invalidates chain", async () => {
    const sink = new MemoryAuditSink()
    await sink.record(ev())
    await sink.record(ev({ kind: "second" }))
    const list = sink.list()
    list[1] = { ...list[1]!, attrs: { tampered: true } }
    const result = verifyChain(list)
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBe(1)
  })

  test("breaking the prevHash linkage invalidates chain", async () => {
    const sink = new MemoryAuditSink()
    await sink.record(ev())
    await sink.record(ev())
    const list = sink.list()
    list[1] = { ...list[1]!, prevHash: "00".repeat(32) }
    expect(verifyChain(list).valid).toBe(false)
  })
})

describe("ConsoleAuditSink", () => {
  test("writes JSON line per event", async () => {
    const lines: string[] = []
    const sink = new ConsoleAuditSink({ writer: (s) => lines.push(s) })
    await sink.record(ev({ kind: "x" }))
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!).kind).toBe("x")
  })
})

describe("JsonlFileAuditSink", () => {
  test("appends JSON line per event to file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-audit-"))
    const path = join(dir, "audit.jsonl")
    try {
      const sink = new JsonlFileAuditSink({ path })
      await sink.record(ev({ kind: "a" }))
      await sink.record(ev({ kind: "b" }))
      await sink.flush()
      const lines = (await readFile(path, "utf8")).trim().split("\n")
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]!).kind).toBe("a")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("hash chain persisted across record() calls", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-audit-"))
    const path = join(dir, "audit.jsonl")
    try {
      const sink = new JsonlFileAuditSink({ path })
      await sink.record(ev())
      await sink.record(ev())
      await sink.flush()
      const lines = (await readFile(path, "utf8"))
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l))
      expect(lines[1].prevHash).toBe(lines[0].hash)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("MultiAuditSink", () => {
  test("fans events to all child sinks", async () => {
    const a = new MemoryAuditSink()
    const b = new MemoryAuditSink()
    const m = new MultiAuditSink([a, b])
    await m.record(ev({ kind: "x" }))
    expect(a.list()).toHaveLength(1)
    expect(b.list()).toHaveLength(1)
  })
})
