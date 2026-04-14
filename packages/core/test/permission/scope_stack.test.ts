import { describe, expect, test } from "bun:test"
import { ScopedPermissionEvaluator } from "../../src/permission/scope_stack.ts"
import type { PermissionRule } from "../../src/permission/types.ts"

describe("ScopedPermissionEvaluator", () => {
  test("most-specific scope wins (session > agent > project > tenant)", () => {
    const tenant: PermissionRule[] = [{ tool: "shell", action: "exec", decision: "deny" }]
    const project: PermissionRule[] = [{ tool: "shell", action: "exec", decision: "ask" }]
    const session: PermissionRule[] = [{ tool: "shell", action: "exec", decision: "allow" }]
    const ev = new ScopedPermissionEvaluator({
      scopes: { tenant, project, session },
    })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("allow")
  })

  test("falls through to next scope when current scope has no matching rule", () => {
    const tenant: PermissionRule[] = [{ tool: "shell", action: "exec", decision: "deny" }]
    const session: PermissionRule[] = [{ tool: "fs", action: "read", decision: "allow" }]
    const ev = new ScopedPermissionEvaluator({ scopes: { tenant, session } })
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("deny")
  })

  test("scope name in result indicates which scope matched", () => {
    const tenant: PermissionRule[] = [{ tool: "shell", action: "exec", decision: "deny" }]
    const ev = new ScopedPermissionEvaluator({ scopes: { tenant } })
    const d = ev.evaluate({ tool: "shell", action: "exec", input: {} })
    expect(d.scope).toBe("tenant")
  })

  test("default decision when no scope has matching rule", () => {
    const ev = new ScopedPermissionEvaluator({ scopes: {}, defaultDecision: "ask" })
    expect(ev.evaluate({ tool: "x", action: "y", input: {} }).decision).toBe("ask")
  })

  test("custom precedence overrides default order", () => {
    const a: PermissionRule[] = [{ tool: "x", action: "y", decision: "allow" }]
    const b: PermissionRule[] = [{ tool: "x", action: "y", decision: "deny" }]
    const ev = new ScopedPermissionEvaluator({
      scopes: { tenant: a, session: b },
      precedence: ["tenant", "session"],
    })
    expect(ev.evaluate({ tool: "x", action: "y", input: {} }).decision).toBe("allow")
  })
})
