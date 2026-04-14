import { describe, expect, test } from "bun:test"

import { PersistentScopedPermissionEvaluator } from "../../src/permission/scope_stack.ts"
import { PermissionRuleStore } from "../../src/permission/store.ts"

describe("PersistentScopedPermissionEvaluator", () => {
  test("loads rules from store and respects scope precedence", async () => {
    const store = new PermissionRuleStore()
    await store.upsert({
      scope: "tenant",
      scopeRef: "tenant-1",
      tool: "shell",
      action: "exec",
      decision: "deny",
    })
    await store.upsert({
      scope: "session",
      scopeRef: "sess-1",
      tool: "shell",
      action: "exec",
      decision: "allow",
    })

    const ev = new PersistentScopedPermissionEvaluator({
      store,
      scopes: {
        tenant: "tenant-1",
        session: "sess-1",
      },
    })
    await ev.ready()

    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("allow")
  })

  test("hot-reloads on rule_changed events", async () => {
    const store = new PermissionRuleStore()
    const ev = new PersistentScopedPermissionEvaluator({
      store,
      scopes: { tenant: "tenant-1" },
      defaultDecision: "ask",
    })
    await ev.ready()
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("ask")

    await store.upsert({
      scope: "tenant",
      scopeRef: "tenant-1",
      tool: "shell",
      action: "exec",
      decision: "deny",
    })
    await ev.sync()
    expect(ev.evaluate({ tool: "shell", action: "exec", input: {} }).decision).toBe("deny")
  })
})
