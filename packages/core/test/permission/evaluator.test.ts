import { describe, expect, test } from "bun:test"
import { PermissionEvaluator } from "../../src/permission/evaluator.ts"
import type { PermissionRule } from "../../src/permission/types.ts"

describe("PermissionEvaluator — basic", () => {
  test("default decision is 'ask' when no rule matches", () => {
    const ev = new PermissionEvaluator({ rules: [] })
    const d = ev.evaluate({ tool: "shell", action: "exec", input: { command: "ls" } })
    expect(d.decision).toBe("ask")
  })

  test("default decision overridable", () => {
    const ev = new PermissionEvaluator({ rules: [], defaultDecision: "deny" })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("deny")
  })

  test("first matching rule wins", () => {
    const rules: PermissionRule[] = [
      { tool: "shell", action: "exec", decision: "allow" },
      { tool: "shell", action: "exec", decision: "deny" },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("allow")
  })

  test("non-matching tool falls through to default", () => {
    const rules: PermissionRule[] = [{ tool: "fs", action: "write", decision: "allow" }]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("ask")
  })

  test("'*' wildcard tool/action match anything", () => {
    const rules: PermissionRule[] = [{ tool: "*", action: "*", decision: "allow" }]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("allow")
  })
})

describe("PermissionEvaluator — conditional rules", () => {
  test("eq condition matches", () => {
    const rules: PermissionRule[] = [
      {
        tool: "shell",
        action: "exec",
        when: { op: "eq", path: "input.command", value: "ls" },
        decision: "allow",
      },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: { command: "ls" } }).decision).toBe(
      "allow",
    )
    expect(ev.evaluate({ tool: "shell", action: "exec", input: { command: "rm" } }).decision).toBe(
      "ask",
    )
  })

  test("starts_with condition matches", () => {
    const rules: PermissionRule[] = [
      {
        tool: "shell",
        action: "exec",
        when: { op: "starts_with", path: "input.command", value: "bun " },
        decision: "allow",
      },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(
      ev.evaluate({ tool: "shell", action: "exec", input: { command: "bun test" } }).decision,
    ).toBe("allow")
    expect(
      ev.evaluate({ tool: "shell", action: "exec", input: { command: "rm -rf /" } }).decision,
    ).toBe("ask")
  })

  test("'in' condition matches list", () => {
    const rules: PermissionRule[] = [
      {
        tool: "shell",
        action: "exec",
        when: { op: "in", path: "input.command", value: ["ls", "pwd", "echo"] },
        decision: "allow",
      },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: { command: "pwd" } }).decision).toBe(
      "allow",
    )
    expect(ev.evaluate({ tool: "shell", action: "exec", input: { command: "rm" } }).decision).toBe(
      "ask",
    )
  })

  test("'matches' regex condition", () => {
    const rules: PermissionRule[] = [
      {
        tool: "fs",
        action: "write",
        when: { op: "matches", path: "input.path", value: "^/tmp/" },
        decision: "allow",
      },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "fs", action: "write", input: { path: "/tmp/x" } }).decision).toBe(
      "allow",
    )
    expect(
      ev.evaluate({ tool: "fs", action: "write", input: { path: "/etc/passwd" } }).decision,
    ).toBe("ask")
  })

  test("composite 'and' requires all children to match", () => {
    const rules: PermissionRule[] = [
      {
        tool: "shell",
        action: "exec",
        when: {
          op: "and",
          children: [
            { op: "starts_with", path: "input.command", value: "bun " },
            { op: "eq", path: "context.env", value: "dev" },
          ],
        },
        decision: "allow",
      },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(
      ev.evaluate({
        tool: "shell",
        action: "exec",
        input: { command: "bun test" },
        context: { env: "dev" },
      }).decision,
    ).toBe("allow")
    expect(
      ev.evaluate({
        tool: "shell",
        action: "exec",
        input: { command: "bun test" },
        context: { env: "prod" },
      }).decision,
    ).toBe("ask")
  })

  test("composite 'or' matches if any child matches", () => {
    const rules: PermissionRule[] = [
      {
        tool: "shell",
        action: "exec",
        when: {
          op: "or",
          children: [
            { op: "eq", path: "input.command", value: "ls" },
            { op: "eq", path: "input.command", value: "pwd" },
          ],
        },
        decision: "allow",
      },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: { command: "pwd" } }).decision).toBe(
      "allow",
    )
  })

  test("composite 'not' inverts child", () => {
    const rules: PermissionRule[] = [
      {
        tool: "shell",
        action: "exec",
        when: {
          op: "not",
          children: [{ op: "starts_with", path: "input.command", value: "rm " }],
        },
        decision: "allow",
      },
    ]
    const ev = new PermissionEvaluator({ rules })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: { command: "ls" } }).decision).toBe(
      "allow",
    )
    expect(
      ev.evaluate({ tool: "shell", action: "exec", input: { command: "rm -rf /" } }).decision,
    ).toBe("ask")
  })

  test("matched rule includes its reason in decision", () => {
    const rules: PermissionRule[] = [
      { tool: "shell", action: "exec", decision: "deny", reason: "policy 1.2.3" },
    ]
    const ev = new PermissionEvaluator({ rules })
    const d = ev.evaluate({ tool: "shell", action: "exec", input: {} })
    expect(d.decision).toBe("deny")
    expect(d.reason).toBe("policy 1.2.3")
    expect(d.matchedRule).toBe(rules[0])
  })
})
