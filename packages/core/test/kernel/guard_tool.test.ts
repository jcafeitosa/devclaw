import { describe, expect, test } from "bun:test"

import { MemoryAuditSink } from "../../src/audit/sink.ts"
import {
  type KernelContext,
  PermissionDeniedError,
  SafetyBlockedError,
  SafetyKernel,
  guardedToolInvoke,
} from "../../src/kernel/index.ts"
import { PermissionEvaluator } from "../../src/permission/evaluator.ts"
import type { PermissionRule } from "../../src/permission/types.ts"
import type { ModerationFlag, ModerationResult, Moderator } from "../../src/safety/types.ts"
import { ToolExecutor } from "../../src/tool/executor.ts"
import { PermissionChecker } from "../../src/tool/permission.ts"
import { ToolRegistry } from "../../src/tool/registry.ts"
import type { Tool } from "../../src/tool/types.ts"

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

const echoTool: Tool<{ text: string }, string> = {
  id: "echo",
  name: "Echo",
  description: "Returns the text provided.",
  risk: "low",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  async handler(input) {
    return input.text
  },
}

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(echoTool)
  return registry
}

function makeSetup(opts: {
  rules?: PermissionRule[]
  defaultDecision?: "allow" | "ask" | "deny"
  inputFlags?: ModerationFlag[]
  outputFlags?: ModerationFlag[]
}) {
  const registry = makeRegistry()
  const executor = new ToolExecutor({
    registry,
    permission: new PermissionChecker({}),
  })
  const audit = new MemoryAuditSink()
  const kernel = new SafetyKernel({
    permission: new PermissionEvaluator({
      rules: opts.rules ?? [],
      defaultDecision: opts.defaultDecision ?? "allow",
    }),
    safety: new StubModerator(opts.inputFlags, opts.outputFlags),
    audit,
  })
  return { registry, executor, kernel, audit }
}

const ctx: KernelContext = { actor: "agent-1", taskId: "task-1", correlationId: "c1" }

describe("guardedToolInvoke — happy path", () => {
  test("runs tool through kernel + audits tool.complete", async () => {
    const { executor, kernel, audit } = makeSetup({})
    const result = await guardedToolInvoke<string>(kernel, executor, ctx, "echo", {
      text: "hi",
    })
    expect(result.output).toBe("hi")
    expect(result.toolId).toBe("echo")
    expect(audit.list().map((e) => e.kind)).toEqual(["tool.complete"])
  })
})

describe("guardedToolInvoke — permission deny", () => {
  test("blocks before handler runs", async () => {
    let handlerRan = false
    const registry = new ToolRegistry()
    registry.register({
      ...echoTool,
      async handler(input) {
        handlerRan = true
        return input.text
      },
    })
    const executor = new ToolExecutor({ registry, permission: new PermissionChecker({}) })
    const audit = new MemoryAuditSink()
    const kernel = new SafetyKernel({
      permission: new PermissionEvaluator({
        rules: [{ tool: "echo", action: "tool.invoke", decision: "deny" }],
      }),
      safety: new StubModerator(),
      audit,
    })
    await expect(
      guardedToolInvoke(kernel, executor, ctx, "echo", { text: "hi" }),
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(handlerRan).toBe(false)
    expect(audit.list().map((e) => e.kind)).toEqual(["permission.deny"])
  })
})

describe("guardedToolInvoke — input safety block", () => {
  test("blocks before handler runs + audits", async () => {
    const leak: ModerationFlag = {
      name: "secret",
      category: "secret_api_key",
      severity: "block",
    }
    const { executor, kernel, audit } = makeSetup({ inputFlags: [leak] })
    await expect(
      guardedToolInvoke(kernel, executor, ctx, "echo", { text: "sk-..." }),
    ).rejects.toBeInstanceOf(SafetyBlockedError)
    expect(audit.list().map((e) => e.kind)).toEqual(["safety.input_block"])
  })
})

describe("guardedToolInvoke — output safety block", () => {
  test("captures tool output and scans it via kernel", async () => {
    const leak: ModerationFlag = {
      name: "ssn",
      category: "pii_ssn",
      severity: "block",
    }
    const { executor, kernel, audit } = makeSetup({ outputFlags: [leak] })
    let caught: unknown = null
    try {
      await guardedToolInvoke(kernel, executor, ctx, "echo", { text: "123-45-6789" })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(SafetyBlockedError)
    expect((caught as SafetyBlockedError).mode).toBe("output")
    expect(audit.list().map((e) => e.kind)).toEqual(["safety.output_block", "tool.fail"])
  })
})

describe("guardedToolInvoke — handler throws", () => {
  test("audits tool.fail and rethrows", async () => {
    const registry = new ToolRegistry()
    registry.register({
      ...echoTool,
      async handler() {
        throw new Error("handler oops")
      },
    })
    const executor = new ToolExecutor({ registry, permission: new PermissionChecker({}) })
    const audit = new MemoryAuditSink()
    const kernel = new SafetyKernel({
      permission: new PermissionEvaluator({ rules: [], defaultDecision: "allow" }),
      safety: new StubModerator(),
      audit,
    })
    await expect(
      guardedToolInvoke(kernel, executor, ctx, "echo", { text: "hi" }),
    ).rejects.toThrow("handler oops")
    expect(audit.list().map((e) => e.kind)).toEqual(["tool.fail"])
  })
})
