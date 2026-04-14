import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildEvent,
  ConsoleAuditSink,
  GENESIS_HASH,
  JsonlFileAuditSink,
  MemoryAuditSink,
  MultiAuditSink,
  verifyChain,
} from "../../src/audit/sink.ts"
import type { AuditEvent, AuditEventInput } from "../../src/audit/types.ts"

function input(over: Partial<AuditEventInput> = {}): AuditEventInput {
  return { source: "test", kind: "noop", ...over }
}

describe("buildEvent — pure function", () => {
  test("severity defaults to 'info' and attrs to empty object", () => {
    const e = buildEvent(input(), GENESIS_HASH)
    expect(e.severity).toBe("info")
    expect(e.attrs).toEqual({})
  })

  test("id is prefixed 'aud_' and at/prevHash passed through", () => {
    const e = buildEvent(input(), GENESIS_HASH, {
      now: () => 5000,
      rng: () => "abc",
    })
    expect(e.id).toBe("aud_abc")
    expect(e.at).toBe(5000)
    expect(e.prevHash).toBe(GENESIS_HASH)
  })

  test("all optional fields are preserved", () => {
    const e = buildEvent(
      input({
        actor: "agent-1",
        target: "file.ts",
        taskId: "task-9",
        agentId: "a-1",
        correlationId: "c-1",
        severity: "warn",
        attrs: { n: 1 },
      }),
      GENESIS_HASH,
    )
    expect(e.actor).toBe("agent-1")
    expect(e.target).toBe("file.ts")
    expect(e.taskId).toBe("task-9")
    expect(e.agentId).toBe("a-1")
    expect(e.correlationId).toBe("c-1")
    expect(e.severity).toBe("warn")
    expect(e.attrs).toEqual({ n: 1 })
  })

  test("hash is deterministic for identical inputs", () => {
    const fixed = { now: () => 1, rng: () => "x" }
    const a = buildEvent(input({ attrs: { z: 1 } }), GENESIS_HASH, fixed)
    const b = buildEvent(input({ attrs: { z: 1 } }), GENESIS_HASH, fixed)
    expect(a.hash).toBe(b.hash)
  })

  test("changing any field changes the hash", () => {
    const fixed = { now: () => 1, rng: () => "x" }
    const base = buildEvent(input(), GENESIS_HASH, fixed)
    const changed = buildEvent(input({ kind: "other" }), GENESIS_HASH, fixed)
    expect(changed.hash).not.toBe(base.hash)
  })

  test("hash is 64-char lowercase hex (SHA-256)", () => {
    const e = buildEvent(input(), GENESIS_HASH)
    expect(e.hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("verifyChain — edge cases", () => {
  test("empty array is valid", () => {
    expect(verifyChain([]).valid).toBe(true)
  })

  test("single untampered event is valid", async () => {
    const s = new MemoryAuditSink()
    await s.record(input())
    expect(verifyChain(s.list()).valid).toBe(true)
  })

  test("first event with wrong prevHash breaks at index 0", async () => {
    const s = new MemoryAuditSink()
    await s.record(input())
    const list = s.list()
    list[0] = { ...list[0]!, prevHash: "ff".repeat(32) }
    const r = verifyChain(list)
    expect(r.valid).toBe(false)
    expect(r.brokenAt).toBe(0)
  })

  test("mutating severity invalidates the chain", async () => {
    const s = new MemoryAuditSink()
    await s.record(input())
    await s.record(input({ severity: "info" }))
    const list = s.list()
    list[1] = { ...list[1]!, severity: "error" }
    expect(verifyChain(list).valid).toBe(false)
  })

  test("mutating attrs content invalidates the chain", async () => {
    const s = new MemoryAuditSink()
    await s.record(input({ attrs: { a: 1 } }))
    const list = s.list()
    list[0] = { ...list[0]!, attrs: { a: 2 } }
    expect(verifyChain(list).valid).toBe(false)
  })

  test("mutating 'at' invalidates the chain", async () => {
    const s = new MemoryAuditSink()
    await s.record(input())
    const list = s.list()
    list[0] = { ...list[0]!, at: list[0]!.at + 1 }
    expect(verifyChain(list).valid).toBe(false)
  })

  test("chain of 10 events validates", async () => {
    const s = new MemoryAuditSink()
    for (let i = 0; i < 10; i++) await s.record(input({ kind: `e-${i}` }))
    expect(verifyChain(s.list()).valid).toBe(true)
  })
})

describe("MemoryAuditSink — query extras", () => {
  async function seed(): Promise<MemoryAuditSink> {
    let now = 1000
    const s = new MemoryAuditSink({ now: () => now })
    await s.record(input({ actor: "u1", taskId: "t1", agentId: "a1" }))
    now = 2000
    await s.record(input({ actor: "u1", taskId: "t2", agentId: "a2" }))
    now = 3000
    await s.record(input({ actor: "u2", taskId: "t2", agentId: "a1" }))
    return s
  }

  test("query by actor", async () => {
    const s = await seed()
    expect(s.query({ actor: "u1" }).length).toBe(2)
    expect(s.query({ actor: "u2" }).length).toBe(1)
  })

  test("query by taskId", async () => {
    const s = await seed()
    expect(s.query({ taskId: "t2" }).length).toBe(2)
  })

  test("query by agentId", async () => {
    const s = await seed()
    expect(s.query({ agentId: "a1" }).length).toBe(2)
  })

  test("query by fromAt inclusive, toAt inclusive", async () => {
    const s = await seed()
    expect(s.query({ fromAt: 2000 }).length).toBe(2)
    expect(s.query({ toAt: 2000 }).length).toBe(2)
    expect(s.query({ fromAt: 1500, toAt: 2500 }).length).toBe(1)
  })

  test("empty query returns all events", async () => {
    const s = await seed()
    expect(s.query({}).length).toBe(3)
  })

  test("query combining fields AND-folds", async () => {
    const s = await seed()
    expect(s.query({ actor: "u1", taskId: "t2" }).length).toBe(1)
  })

  test("query with no matches returns empty array", async () => {
    const s = await seed()
    expect(s.query({ actor: "ghost" })).toEqual([])
  })

  test("first event uses GENESIS_HASH as prevHash", async () => {
    const s = new MemoryAuditSink()
    const e = await s.record(input())
    expect(e.prevHash).toBe(GENESIS_HASH)
  })

  test("two independent sinks produce independent chains", async () => {
    const a = new MemoryAuditSink()
    const b = new MemoryAuditSink()
    const ea = await a.record(input())
    const eb = await b.record(input())
    expect(ea.id).not.toBe(eb.id)
  })
})

describe("ConsoleAuditSink — default writer", () => {
  test("writes without throwing even when writer is default console.log", async () => {
    const original = console.log
    const lines: string[] = []
    console.log = (line: unknown) => {
      lines.push(String(line))
    }
    try {
      const s = new ConsoleAuditSink()
      await s.record(input())
      expect(lines).toHaveLength(1)
      expect(JSON.parse(lines[0]!).source).toBe("test")
    } finally {
      console.log = original
    }
  })

  test("multiple records chain correctly", async () => {
    const lines: string[] = []
    const s = new ConsoleAuditSink({
      writer: (l) => {
        lines.push(l)
      },
    })
    await s.record(input())
    await s.record(input())
    const parsed = lines.map((l) => JSON.parse(l)) as AuditEvent[]
    expect(parsed[1]!.prevHash).toBe(parsed[0]!.hash)
  })
})

describe("JsonlFileAuditSink — buffering", () => {
  test("flushEvery batches writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-audit-buf-"))
    const path = join(dir, "a.jsonl")
    try {
      const s = new JsonlFileAuditSink({ path, flushEvery: 3 })
      await s.record(input())
      await s.record(input())
      // still in buffer — file may not exist or be empty
      let contents = await readFile(path, "utf8").catch(() => "")
      expect(contents).toBe("")
      await s.record(input())
      // third record triggers flush
      contents = await readFile(path, "utf8")
      expect(contents.trim().split("\n").length).toBe(3)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("flush() on empty buffer is a no-op", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-audit-empty-"))
    const path = join(dir, "a.jsonl")
    try {
      const s = new JsonlFileAuditSink({ path })
      await s.flush()
      const exists = await Bun.file(path).exists()
      expect(exists).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("long sequence persists a valid chain", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-audit-long-"))
    const path = join(dir, "a.jsonl")
    try {
      const s = new JsonlFileAuditSink({ path, flushEvery: 2 })
      for (let i = 0; i < 10; i++) await s.record(input({ kind: `k-${i}` }))
      await s.flush()
      const events = (await readFile(path, "utf8"))
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as AuditEvent)
      expect(events).toHaveLength(10)
      expect(verifyChain(events).valid).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("MultiAuditSink — flush + fallback", () => {
  test("flush() fans out to children that support it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-audit-multi-"))
    const path = join(dir, "a.jsonl")
    try {
      const mem = new MemoryAuditSink()
      const file = new JsonlFileAuditSink({ path, flushEvery: 100 })
      const m = new MultiAuditSink([mem, file])
      await m.record(input())
      await m.flush()
      const contents = await readFile(path, "utf8")
      expect(contents.trim().split("\n")).toHaveLength(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("record with empty children returns a genesis-linked event", async () => {
    const m = new MultiAuditSink([])
    const e = await m.record(input())
    expect(e.prevHash).toBe(GENESIS_HASH)
    expect(e.id).toMatch(/^aud_/)
  })

  test("each child maintains its own chain independently", async () => {
    const a = new MemoryAuditSink()
    const b = new MemoryAuditSink()
    const m = new MultiAuditSink([a, b])
    await m.record(input())
    await m.record(input())
    const listA = a.list()
    const listB = b.list()
    expect(verifyChain(listA).valid).toBe(true)
    expect(verifyChain(listB).valid).toBe(true)
    // same input recorded at same time, but ids differ via rng randomness
    expect(listA[0]!.id).not.toBe(listB[0]!.id)
  })
})

describe("attribute serialization", () => {
  test("nested attrs round-trip through hash", async () => {
    const s = new MemoryAuditSink()
    const e = await s.record(input({ attrs: { nested: { a: [1, 2, 3], b: "str" } } }))
    expect(e.attrs).toEqual({ nested: { a: [1, 2, 3], b: "str" } })
    expect(verifyChain([e]).valid).toBe(true)
  })

  test("unicode strings are preserved and hash-stable", async () => {
    const s = new MemoryAuditSink({ now: () => 1, rng: () => "x" })
    const e = await s.record(input({ attrs: { msg: "café ☕ açaí" } }))
    expect(e.attrs.msg).toBe("café ☕ açaí")
    expect(verifyChain([e]).valid).toBe(true)
  })
})
