import { beforeEach, describe, expect, test } from "bun:test"

import { MemoryAuditSink } from "../../src/audit/sink.ts"
import type { AuditSink } from "../../src/audit/types.ts"
import {
  type KernelContext,
  type KernelEvent,
  type KernelOp,
  PermissionDeniedError,
  SafetyBlockedError,
  SafetyKernel,
} from "../../src/kernel/index.ts"
import { PermissionEvaluator } from "../../src/permission/evaluator.ts"
import type { PermissionRule } from "../../src/permission/types.ts"
import type { ModerationFlag, ModerationResult, Moderator } from "../../src/safety/types.ts"

class StubModerator implements Moderator {
  constructor(
    private readonly inputFlags: ModerationFlag[] = [],
    private readonly outputFlags: ModerationFlag[] = [],
  ) {}

  async check(_text: string, mode: "input" | "output"): Promise<ModerationResult> {
    const flags = mode === "input" ? this.inputFlags : this.outputFlags
    return { allowed: flags.length === 0, flags }
  }

  async scrub(text: string): Promise<string> {
    return text
  }
}

function makeKernel(opts: {
  rules?: PermissionRule[]
  defaultDecision?: "allow" | "ask" | "deny"
  inputFlags?: ModerationFlag[]
  outputFlags?: ModerationFlag[]
  audit?: AuditSink
}): { kernel: SafetyKernel; audit: MemoryAuditSink } {
  const audit = opts.audit ?? new MemoryAuditSink()
  const kernel = new SafetyKernel({
    permission: new PermissionEvaluator({
      rules: opts.rules ?? [],
      defaultDecision: opts.defaultDecision ?? "allow",
    }),
    safety: new StubModerator(opts.inputFlags, opts.outputFlags),
    audit,
  })
  return { kernel, audit: audit as MemoryAuditSink }
}

function toolOp(
  overrides: Partial<KernelOp> & {
    events?: KernelEvent[]
    throwOn?: string
  } = {},
): KernelOp {
  const events = overrides.events ?? [{ type: "text", content: "ok" }, { type: "completed" }]
  return {
    kind: overrides.kind ?? "tool",
    tool: overrides.tool ?? "fs_read",
    action: overrides.action ?? "tool.invoke",
    inputText: overrides.inputText ?? "hello",
    input: overrides.input ?? {},
    target: overrides.target,
    execute: overrides.execute ??
      (async function* () {
        for (const ev of events) {
          if (overrides.throwOn === ev.type) throw new Error(`boom:${ev.type}`)
          yield ev
        }
      }),
  }
}

async function collect(iter: AsyncIterable<KernelEvent>): Promise<KernelEvent[]> {
  const out: KernelEvent[] = []
  for await (const ev of iter) out.push(ev)
  return out
}

const ctx: KernelContext = { actor: "agent-1", taskId: "task-1", correlationId: "corr-1" }

describe("SafetyKernel.invoke — allow path", () => {
  test("passes events through + audits completion", async () => {
    const { kernel, audit } = makeKernel({ defaultDecision: "allow" })
    const events = await collect(kernel.invoke(ctx, toolOp()))

    expect(events.map((e) => e.type)).toEqual(["text", "completed"])
    const list = audit.list()
    expect(list.map((e) => e.kind)).toEqual(["tool.complete"])
    expect(list[0]?.severity).toBe("info")
    expect(list[0]?.actor).toBe("agent-1")
    expect(list[0]?.taskId).toBe("task-1")
    expect(list[0]?.correlationId).toBe("corr-1")
    expect(list[0]?.attrs.action).toBe("tool.invoke")
    expect(typeof list[0]?.attrs.durationMs).toBe("number")
    expect(list[0]?.attrs.outputLen).toBe(2)
  })
})

describe("SafetyKernel.invoke — permission", () => {
  test("deny throws PermissionDeniedError and audits permission.deny", async () => {
    const { kernel, audit } = makeKernel({
      rules: [{ tool: "fs_read", action: "tool.invoke", decision: "deny", reason: "sandbox" }],
    })
    let called = false
    const op = toolOp({
      execute: async function* () {
        called = true
        yield { type: "completed" }
      },
    })
    await expect(collect(kernel.invoke(ctx, op))).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(called).toBe(false)
    expect(audit.list().map((e) => e.kind)).toEqual(["permission.deny"])
    expect(audit.list()[0]?.severity).toBe("warn")
    expect(audit.list()[0]?.attrs.reason).toBe("sandbox")
  })

  test("ask without approvalChannel denies with reason no_approval_channel", async () => {
    const { kernel, audit } = makeKernel({ defaultDecision: "ask" })
    let caught: unknown = null
    try {
      await collect(kernel.invoke(ctx, toolOp()))
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(PermissionDeniedError)
    expect((caught as PermissionDeniedError).reason).toBe("no_approval_channel")
    expect(audit.list().map((e) => e.kind)).toEqual(["permission.ask", "permission.deny"])
  })

  test("ask with approval allows through", async () => {
    const { kernel, audit } = makeKernel({ defaultDecision: "ask" })
    let asked: KernelOp | null = null
    const ctxWithApproval: KernelContext = {
      ...ctx,
      approvalChannel: {
        async request(op) {
          asked = op
          return true
        },
      },
    }
    const events = await collect(kernel.invoke(ctxWithApproval, toolOp()))
    expect(events.map((e) => e.type)).toEqual(["text", "completed"])
    expect(asked).not.toBeNull()
    expect(audit.list().map((e) => e.kind)).toEqual(["permission.ask", "tool.complete"])
  })

  test("ask with refusal denies", async () => {
    const { kernel, audit } = makeKernel({ defaultDecision: "ask" })
    const ctxRefuse: KernelContext = {
      ...ctx,
      approvalChannel: {
        async request() {
          return false
        },
      },
    }
    await expect(collect(kernel.invoke(ctxRefuse, toolOp()))).rejects.toBeInstanceOf(
      PermissionDeniedError,
    )
    expect(audit.list().map((e) => e.kind)).toEqual(["permission.ask", "permission.deny"])
  })
})

describe("SafetyKernel.invoke — safety", () => {
  const ssn: ModerationFlag = { name: "ssn", category: "pii_ssn", severity: "block" }

  test("input block throws SafetyBlockedError('input') and skips execute", async () => {
    const { kernel, audit } = makeKernel({ inputFlags: [ssn] })
    let called = false
    const op = toolOp({
      execute: async function* () {
        called = true
        yield { type: "completed" }
      },
    })
    let caught: unknown = null
    try {
      await collect(kernel.invoke(ctx, op))
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SafetyBlockedError)
    expect((caught as SafetyBlockedError).mode).toBe("input")
    expect(called).toBe(false)
    expect(audit.list().map((e) => e.kind)).toEqual(["safety.input_block"])
  })

  test("output block on text chunk throws SafetyBlockedError('output')", async () => {
    const leak: ModerationFlag = {
      name: "secret",
      category: "secret_api_key",
      severity: "block",
    }
    const { kernel, audit } = makeKernel({ outputFlags: [leak] })
    let caught: unknown = null
    try {
      await collect(
        kernel.invoke(ctx, toolOp({ events: [{ type: "text", content: "sk-..." }] })),
      )
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SafetyBlockedError)
    expect((caught as SafetyBlockedError).mode).toBe("output")
    expect(audit.list().map((e) => e.kind)).toEqual(["safety.output_block", "tool.fail"])
  })
})

describe("SafetyKernel.invoke — execute errors", () => {
  test("wraps execute throw with tool.fail audit + rethrows", async () => {
    const { kernel, audit } = makeKernel({})
    await expect(collect(kernel.invoke(ctx, toolOp({ throwOn: "completed" })))).rejects.toThrow(
      "boom:completed",
    )
    const list = audit.list()
    expect(list.map((e) => e.kind)).toEqual(["tool.fail"])
    expect(list[0]?.severity).toBe("error")
  })
})

describe("SafetyKernel.invoke — provider and bridge ops", () => {
  test("provider kind produces provider.complete audit", async () => {
    const { kernel, audit } = makeKernel({})
    const events = await collect(kernel.invoke(ctx, toolOp({ kind: "provider" })))
    expect(events.length).toBe(2)
    expect(audit.list().map((e) => e.kind)).toEqual(["provider.complete"])
  })

  test("bridge kind produces bridge.complete audit", async () => {
    const { kernel, audit } = makeKernel({})
    const events = await collect(kernel.invoke(ctx, toolOp({ kind: "bridge" })))
    expect(events.length).toBe(2)
    expect(audit.list().map((e) => e.kind)).toEqual(["bridge.complete"])
  })
})

beforeEach(() => {
  // isolate each test's random ids for audit sink determinism — no global state
})
