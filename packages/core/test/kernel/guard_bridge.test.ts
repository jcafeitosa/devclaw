import { describe, expect, test } from "bun:test"

import { MemoryAuditSink } from "../../src/audit/sink.ts"
import type { Bridge, BridgeEvent, BridgeRequest, Capabilities } from "../../src/bridge/types.ts"
import {
  type KernelContext,
  PermissionDeniedError,
  SafetyBlockedError,
  SafetyKernel,
  guardedBridgeExecute,
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

function stubBridge(events: BridgeEvent[]): Bridge {
  return {
    cli: "claude",
    async isAvailable() {
      return true
    },
    async isAuthenticated() {
      return { authed: true }
    },
    capabilities(): Capabilities {
      return {
        modes: ["agentic"],
        contextWindow: 200_000,
        supportsTools: true,
        supportsSubagents: false,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsWebSearch: false,
        supportsMcp: false,
        preferredFor: ["planning"],
      }
    },
    estimateCost() {
      return { costUsd: 0, tokensIn: 0, tokensOut: 0, subscriptionCovered: true }
    },
    execute(): AsyncIterable<BridgeEvent> {
      return (async function* () {
        for (const ev of events) yield ev
      })()
    },
    async cancel() {},
  }
}

function makeSetup(opts: {
  rules?: PermissionRule[]
  defaultDecision?: "allow" | "ask" | "deny"
  inputFlags?: ModerationFlag[]
  outputFlags?: ModerationFlag[]
}) {
  const audit = new MemoryAuditSink()
  const kernel = new SafetyKernel({
    permission: new PermissionEvaluator({
      rules: opts.rules ?? [],
      defaultDecision: opts.defaultDecision ?? "allow",
    }),
    safety: new StubModerator(opts.inputFlags, opts.outputFlags),
    audit,
  })
  return { kernel, audit }
}

const ctx: KernelContext = { actor: "agent-b", taskId: "task-b", correlationId: "corr-b" }

const req: BridgeRequest = {
  taskId: "task-b",
  agentId: "agent-b",
  cli: "claude",
  cwd: "/tmp",
  prompt: "summarize findings",
}

async function drain(iter: AsyncIterable<BridgeEvent>): Promise<BridgeEvent[]> {
  const out: BridgeEvent[] = []
  for await (const ev of iter) out.push(ev)
  return out
}

describe("guardedBridgeExecute — happy path", () => {
  test("passes bridge events through + audits bridge.complete", async () => {
    const bridge = stubBridge([
      { type: "started", at: 1 },
      { type: "text", content: "result one" },
      { type: "completed", summary: "done" },
    ])
    const { kernel, audit } = makeSetup({})
    const events = await drain(guardedBridgeExecute(kernel, bridge, ctx, req))
    expect(events.map((e) => e.type)).toEqual(["started", "text", "completed"])
    expect(audit.list().map((e) => e.kind)).toEqual(["bridge.complete"])
    expect(audit.list()[0]?.attrs.tool).toBe("claude")
  })
})

describe("guardedBridgeExecute — permission deny", () => {
  test("blocks before bridge.execute runs", async () => {
    let called = false
    const bridge: Bridge = {
      ...stubBridge([]),
      execute(): AsyncIterable<BridgeEvent> {
        called = true
        return (async function* () {})()
      },
    }
    const { kernel, audit } = makeSetup({
      rules: [{ tool: "claude", action: "bridge.execute", decision: "deny" }],
    })
    await expect(drain(guardedBridgeExecute(kernel, bridge, ctx, req))).rejects.toBeInstanceOf(
      PermissionDeniedError,
    )
    expect(called).toBe(false)
    expect(audit.list().map((e) => e.kind)).toEqual(["permission.deny"])
  })
})

describe("guardedBridgeExecute — input safety block", () => {
  test("scans req.prompt as inputText", async () => {
    const leak: ModerationFlag = {
      name: "secret",
      category: "secret_api_key",
      severity: "block",
    }
    let called = false
    const bridge: Bridge = {
      ...stubBridge([]),
      execute(): AsyncIterable<BridgeEvent> {
        called = true
        return (async function* () {})()
      },
    }
    const { kernel, audit } = makeSetup({ inputFlags: [leak] })
    await expect(drain(guardedBridgeExecute(kernel, bridge, ctx, req))).rejects.toBeInstanceOf(
      SafetyBlockedError,
    )
    expect(called).toBe(false)
    expect(audit.list().map((e) => e.kind)).toEqual(["safety.input_block"])
  })
})

describe("guardedBridgeExecute — output safety block", () => {
  test("throws on flagged text chunk mid-stream", async () => {
    const leak: ModerationFlag = {
      name: "ssn",
      category: "pii_ssn",
      severity: "block",
    }
    const bridge = stubBridge([
      { type: "started", at: 1 },
      { type: "text", content: "123-45-6789" },
      { type: "completed" },
    ])
    const { kernel, audit } = makeSetup({ outputFlags: [leak] })
    let caught: unknown = null
    const seen: BridgeEvent[] = []
    try {
      for await (const ev of guardedBridgeExecute(kernel, bridge, ctx, req)) {
        seen.push(ev)
      }
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SafetyBlockedError)
    expect((caught as SafetyBlockedError).mode).toBe("output")
    // events before the flagged chunk are allowed through
    expect(seen.map((e) => e.type)).toEqual(["started"])
    expect(audit.list().map((e) => e.kind)).toEqual([
      "safety.output_block",
      "bridge.fail",
    ])
  })
})

describe("guardedBridgeExecute — bridge throws", () => {
  test("audits bridge.fail and rethrows", async () => {
    const bridge: Bridge = {
      ...stubBridge([]),
      execute(): AsyncIterable<BridgeEvent> {
        return (async function* () {
          yield { type: "started", at: 1 }
          throw new Error("bridge kaboom")
        })()
      },
    }
    const { kernel, audit } = makeSetup({})
    await expect(drain(guardedBridgeExecute(kernel, bridge, ctx, req))).rejects.toThrow(
      "bridge kaboom",
    )
    expect(audit.list().map((e) => e.kind)).toEqual(["bridge.fail"])
  })
})
