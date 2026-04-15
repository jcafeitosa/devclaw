import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { PermissionRuleStore } from "../../src/permission/store.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe("PermissionRuleStore", () => {
  test("persists rules across store instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-permission-store-"))
    dirs.push(dir)
    const sqlitePath = join(dir, "permission.db")

    const first = new PermissionRuleStore({ sqlitePath })
    await first.upsert({
      scope: "tenant",
      scopeRef: "tenant-1",
      tool: "shell",
      action: "exec",
      decision: "deny",
      reason: "policy",
    })

    const second = new PermissionRuleStore({ sqlitePath })
    const rules = await second.list({ scope: "tenant", scopeRef: "tenant-1" })
    expect(rules).toHaveLength(1)
    expect(rules[0]?.reason).toBe("policy")
  })

  test("revoke keeps audit trail but hides rule from active list", async () => {
    const store = new PermissionRuleStore()
    const rule = await store.upsert({
      scope: "session",
      scopeRef: "sess-1",
      tool: "fs",
      action: "read",
      decision: "allow",
    })

    await store.revoke(rule.id)

    expect(await store.list({ scope: "session", scopeRef: "sess-1" })).toEqual([])
    const all = await store.list({ scope: "session", scopeRef: "sess-1", includeRevoked: true })
    expect(all[0]?.revokedAt).toBeDefined()
  })
})
