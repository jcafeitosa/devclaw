import { createHash } from "node:crypto"
import { appendFile } from "node:fs/promises"
import type { AuditEvent, AuditEventInput, AuditQuery, AuditSink } from "./types.ts"

export const GENESIS_HASH = "00".repeat(32)

function eventBodyForHash(event: Omit<AuditEvent, "hash">): string {
  return JSON.stringify({
    id: event.id,
    at: event.at,
    source: event.source,
    kind: event.kind,
    severity: event.severity,
    attrs: event.attrs,
    actor: event.actor,
    target: event.target,
    taskId: event.taskId,
    agentId: event.agentId,
    correlationId: event.correlationId,
    prevHash: event.prevHash,
  })
}

function hashEvent(event: Omit<AuditEvent, "hash">): string {
  return createHash("sha256").update(eventBodyForHash(event)).digest("hex")
}

export interface ChainBuilder {
  now: () => number
  rng: () => string
}

const DEFAULT_BUILDER: ChainBuilder = {
  now: Date.now,
  rng: () => Math.floor(Math.random() * 1e12).toString(36),
}

export function buildEvent(
  input: AuditEventInput,
  prevHash: string,
  builder: ChainBuilder = DEFAULT_BUILDER,
): AuditEvent {
  const partial: Omit<AuditEvent, "hash"> = {
    id: `aud_${builder.rng()}`,
    at: builder.now(),
    source: input.source,
    kind: input.kind,
    severity: input.severity ?? "info",
    attrs: input.attrs ?? {},
    actor: input.actor,
    target: input.target,
    taskId: input.taskId,
    agentId: input.agentId,
    correlationId: input.correlationId,
    prevHash,
  }
  return { ...partial, hash: hashEvent(partial) }
}

export interface VerifyResult {
  valid: boolean
  brokenAt?: number
}

export function verifyChain(events: AuditEvent[]): VerifyResult {
  let prev = GENESIS_HASH
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!
    if (e.prevHash !== prev) return { valid: false, brokenAt: i }
    const recomputed = hashEvent({
      id: e.id,
      at: e.at,
      source: e.source,
      kind: e.kind,
      severity: e.severity,
      attrs: e.attrs,
      actor: e.actor,
      target: e.target,
      taskId: e.taskId,
      agentId: e.agentId,
      correlationId: e.correlationId,
      prevHash: e.prevHash,
    })
    if (recomputed !== e.hash) return { valid: false, brokenAt: i }
    prev = e.hash
  }
  return { valid: true }
}

function matches(event: AuditEvent, q: AuditQuery): boolean {
  if (q.source && event.source !== q.source) return false
  if (q.kind && event.kind !== q.kind) return false
  if (q.severity && event.severity !== q.severity) return false
  if (q.actor && event.actor !== q.actor) return false
  if (q.taskId && event.taskId !== q.taskId) return false
  if (q.agentId && event.agentId !== q.agentId) return false
  if (q.fromAt !== undefined && event.at < q.fromAt) return false
  if (q.toAt !== undefined && event.at > q.toAt) return false
  return true
}

export interface MemoryAuditSinkConfig {
  now?: () => number
  rng?: () => string
}

export class MemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = []
  private prevHash = GENESIS_HASH
  private readonly builder: ChainBuilder

  constructor(cfg: MemoryAuditSinkConfig = {}) {
    this.builder = {
      now: cfg.now ?? DEFAULT_BUILDER.now,
      rng: cfg.rng ?? DEFAULT_BUILDER.rng,
    }
  }

  async record(input: AuditEventInput): Promise<AuditEvent> {
    const event = buildEvent(input, this.prevHash, this.builder)
    this.events.push(event)
    this.prevHash = event.hash
    return event
  }

  list(): AuditEvent[] {
    return [...this.events]
  }

  query(q: AuditQuery): AuditEvent[] {
    return this.events.filter((e) => matches(e, q))
  }
}

export interface ConsoleAuditSinkConfig {
  writer?: (line: string) => void
  builder?: Partial<ChainBuilder>
}

export class ConsoleAuditSink implements AuditSink {
  private readonly writer: (line: string) => void
  private prevHash = GENESIS_HASH
  private readonly builder: ChainBuilder

  constructor(cfg: ConsoleAuditSinkConfig = {}) {
    this.writer = cfg.writer ?? ((s) => console.log(s))
    this.builder = { ...DEFAULT_BUILDER, ...(cfg.builder ?? {}) }
  }

  async record(input: AuditEventInput): Promise<AuditEvent> {
    const event = buildEvent(input, this.prevHash, this.builder)
    this.prevHash = event.hash
    this.writer(JSON.stringify(event))
    return event
  }
}

export interface JsonlFileAuditSinkConfig {
  path: string
  builder?: Partial<ChainBuilder>
  flushEvery?: number
}

export class JsonlFileAuditSink implements AuditSink {
  private readonly path: string
  private prevHash = GENESIS_HASH
  private readonly builder: ChainBuilder
  private buffer: string[] = []
  private readonly flushEvery: number

  constructor(cfg: JsonlFileAuditSinkConfig) {
    this.path = cfg.path
    this.builder = { ...DEFAULT_BUILDER, ...(cfg.builder ?? {}) }
    this.flushEvery = cfg.flushEvery ?? 1
  }

  async record(input: AuditEventInput): Promise<AuditEvent> {
    const event = buildEvent(input, this.prevHash, this.builder)
    this.prevHash = event.hash
    this.buffer.push(`${JSON.stringify(event)}\n`)
    if (this.buffer.length >= this.flushEvery) await this.flush()
    return event
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const data = this.buffer.join("")
    this.buffer = []
    await appendFile(this.path, data, "utf8")
  }
}

export class MultiAuditSink implements AuditSink {
  constructor(private readonly children: AuditSink[]) {}

  async record(input: AuditEventInput): Promise<AuditEvent> {
    const results = await Promise.all(this.children.map((c) => c.record(input)))
    return results[0] ?? buildEvent(input, GENESIS_HASH)
  }

  async flush(): Promise<void> {
    await Promise.all(this.children.map((c) => c.flush?.()))
  }
}
